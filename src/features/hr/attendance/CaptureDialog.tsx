import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  requestCaptureToken,
  submitAttendanceEvent,
  type AttendanceEvent,
  type AttendanceResult,
  type AttendanceToday,
} from '../../../services/hr/attendance';
import { hrErrorMessage } from '../../../services/hr/client';
import { useSessionStore } from '../../../store/sessionStore';
import DialogShell from './DialogShell';
import { attendanceKeys, useObjectUrl } from './attendanceQueries';
import {
  cameraSupported,
  captureFrame,
  fixAgeSeconds,
  locate,
  LocationError,
  startCamera,
  stopCamera,
  type GeoFix,
} from './attendanceDevice';
import {
  CAMERA_UNAVAILABLE_MESSAGE,
  cameraMessage,
  describeAttendanceError,
  exceptionLabel,
  expectedException,
  flagLabel,
  formatClock,
  formatDistance,
  formatTimeIst,
  hhmmIst,
  locationMessage,
  type AttendanceProblem,
} from './attendanceFormat';

interface Props {
  event: AttendanceEvent;
  today: AttendanceToday;
  /** Server clock minus device clock, ms, so "late" is judged the way the server will. */
  clockSkewMs: number;
  onClose: () => void;
}

type Step = 'camera' | 'review' | 'done';
type CameraState = { status: 'starting' | 'ready' | 'error'; message?: string };
type LocationState = { status: 'loading' | 'ready' | 'error'; fix?: GeoFix; message?: string };
interface Shot { blob: Blob; token: string; issuedAt: number; ttlMs: number }

/** A fix older than this is refreshed before sending: the server refuses fixes older than a minute. */
const FRESH_FIX_SECONDS = 20;

/**
 * Check in / check out: live camera, location, then one request. A late or early event only needs
 * an optional note; being outside the outlet area (422 ATTENDANCE_REASON_REQUIRED) needs a reason,
 * and the same photo is sent again once the person has typed it and pressed the button.
 */
export default function CaptureDialog({ event, today, clockSkewMs, onClose }: Props) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const isIn = event === 'CHECK_IN';
  const verb = isIn ? 'Check in' : 'Check out';

  const [step, setStep] = useState<Step>('camera');
  const [camera, setCamera] = useState<CameraState>({ status: 'starting' });
  const [location, setLocation] = useState<LocationState>({ status: 'loading' });
  const [busy, setBusy] = useState<'photo' | 'send' | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const [problem, setProblem] = useState<AttendanceProblem | null>(null);
  const [needsReason, setNeedsReason] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonMissing, setReasonMissing] = useState(false);
  const [result, setResult] = useState<AttendanceResult | null>(null);
  const [cameraRun, setCameraRun] = useState(0);

  const video = useRef<HTMLVideoElement>(null);
  const alive = useRef(true);
  const refresh = useRef(false);
  const shotUrl = useObjectUrl(shot?.blob);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Live camera while this step is showing. The stream is stopped as soon as the photo is taken.
  useEffect(() => {
    if (step !== 'camera') return undefined;
    if (!cameraSupported()) {
      setCamera({ status: 'error', message: CAMERA_UNAVAILABLE_MESSAGE });
      return undefined;
    }
    let stream: MediaStream | null = null;
    let cancelled = false;
    setCamera({ status: 'starting' });
    startCamera()
      .then(async (opened) => {
        if (cancelled) {
          stopCamera(opened);
          return;
        }
        stream = opened;
        const element = video.current;
        if (!element) return;
        element.srcObject = opened;
        try {
          await element.play();
        } catch {
          // Some browsers start playing on their own once metadata is in; ready is set below.
        }
        if (!cancelled) setCamera({ status: 'ready' });
      })
      .catch((error: unknown) => {
        if (!cancelled) setCamera({ status: 'error', message: cameraMessage(error) });
      });
    return () => {
      cancelled = true;
      stopCamera(stream);
      if (video.current) video.current.srcObject = null;
    };
  }, [step, cameraRun]);

  const findLocation = useCallback(async (): Promise<GeoFix | null> => {
    setLocation({ status: 'loading' });
    try {
      const fix = await locate();
      if (alive.current) setLocation({ status: 'ready', fix });
      return fix;
    } catch (error) {
      const message = locationMessage(error instanceof LocationError ? error.problem : 'UNAVAILABLE');
      if (alive.current) setLocation({ status: 'error', message });
      return null;
    }
  }, []);

  useEffect(() => {
    void findLocation();
  }, [findLocation]);

  const takePhoto = async () => {
    if (busy || !video.current || !accessToken) return;
    setBusy('photo');
    setProblem(null);
    try {
      const blob = await captureFrame(video.current);
      const issued = await requestCaptureToken(accessToken, event);
      if (!alive.current) return;
      setShot({ blob, token: issued.token, issuedAt: Date.now(), ttlMs: issued.ttlSeconds * 1000 });
      setStep('review');
    } catch (error) {
      if (alive.current) setProblem({ message: hrErrorMessage(error), next: 'again', stale: false });
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const retake = () => {
    setShot(null);
    setProblem(null);
    setCameraRun((run) => run + 1);
    setStep('camera');
  };

  const send = async () => {
    if (busy || !shot || !accessToken) return;
    if (needsReason && !reason.trim()) {
      setReasonMissing(true);
      return;
    }
    if (Date.now() - shot.issuedAt > shot.ttlMs) {
      setProblem({ message: 'This photo session has expired. Take the photo again.', next: 'retake', stale: false });
      return;
    }
    setBusy('send');
    setProblem(null);
    setReasonMissing(false);
    try {
      let fix = location.fix ?? null;
      if (!fix || fixAgeSeconds(fix) > FRESH_FIX_SECONDS) fix = await findLocation();
      if (!fix) {
        setProblem({ message: 'Your location is needed to send this. Check that location is switched on and try again.', next: 'again', stale: false });
        return;
      }
      const saved = await submitAttendanceEvent(accessToken, event, {
        photo: shot.blob,
        token: shot.token,
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracyM: fix.accuracyM,
        positionAgeS: fixAgeSeconds(fix),
        reason: reason.trim() || undefined,
      });
      refresh.current = true; // today and the month are re-read once, when this window closes
      if (alive.current) {
        setResult(saved);
        setStep('done');
      }
    } catch (error) {
      const described = describeAttendanceError(error);
      if (described.stale) refresh.current = true;
      if (described.next === 'reason') setNeedsReason(true);
      if (alive.current) setProblem(described);
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const close = () => {
    if (refresh.current) {
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.today });
      void queryClient.invalidateQueries({ queryKey: ['hr', 'attendance', 'me'] });
    }
    onClose();
  };

  const expected = expectedException(event, hhmmIst(new Date(Date.now() + clockSkewMs)), today.standardTimes);
  const locked = busy !== null;
  const canTakePhoto = camera.status === 'ready' && location.status === 'ready' && !busy;

  // ---- done ------------------------------------------------------------------------------------
  if (step === 'done' && result) {
    const distance = formatDistance(result.distanceM);
    return (
      <DialogShell title={isIn ? 'You are checked in' : 'You are checked out'} eyebrow="Attendance" onClose={close}>
        <div className="uc01-admin-message uc01-admin-message--success" role="status">
          Recorded at <strong>{formatTimeIst(result.at)}</strong> (IST).
        </div>
        <dl className="hr-att-facts">
          {(result.outletName || distance) && (
            <div>
              <dt>Place</dt>
              <dd>{[result.outletName, distance ? `${distance} from the outlet` : null].filter(Boolean).join(', ')}</dd>
            </div>
          )}
          {result.address && (
            <div>
              <dt>Address on the photo</dt>
              <dd>{result.address}</dd>
            </div>
          )}
        </dl>
        {result.flags.length > 0 && (
          <span className="hr-flags">{result.flags.map((flag) => <span key={flag} className="hr-flag">{flagLabel(flag)}</span>)}</span>
        )}
        {result.needsApproval.length > 0 && (
          <div className="uc01-admin-message uc01-admin-message--info" role="status">
            {result.needsApproval.map(exceptionLabel).join(' and ')} noted. It has gone to your Team Lead or Project Manager
            for approval. Your status will show &ldquo;Awaiting approval&rdquo; until they decide.
          </div>
        )}
        <div className="uc01-admin-dialog__actions">
          <button type="button" className="uc01-admin-button uc01-admin-button--primary" onClick={close} autoFocus>Done</button>
        </div>
      </DialogShell>
    );
  }

  // ---- camera and review -----------------------------------------------------------------------
  return (
    <DialogShell title={verb} eyebrow="Attendance" onClose={close} locked={locked}>
      {step === 'camera' && (
        <>
          <p>
            Take a live photo of yourself. The server prints the time, place and address on it. You cannot choose a photo
            from your gallery.
          </p>
          <div className="hr-att-camera">
            <video ref={video} playsInline muted autoPlay aria-label="Live camera" />
            {camera.status === 'starting' && <div className="hr-att-camera__cover">Starting the camera…</div>}
            {camera.status === 'error' && <div className="hr-att-camera__cover" role="alert">{camera.message}</div>}
          </div>
          {camera.status === 'error' && camera.message !== CAMERA_UNAVAILABLE_MESSAGE && (
            <button type="button" className="uc01-admin-button" onClick={() => setCameraRun((run) => run + 1)}>Try the camera again</button>
          )}

          <div className="hr-att-locstatus" aria-live="polite">
            {location.status === 'loading' && <span className="uc01-admin-message uc01-admin-message--info">Finding your location…</span>}
            {location.status === 'ready' && location.fix && (
              <span className="uc01-admin-message uc01-admin-message--success">
                Location found, accurate to about {Math.round(location.fix.accuracyM)} m.
                {location.fix.accuracyM > 100 && ' This is not very accurate. If it is refused, move to an open area and try again.'}
              </span>
            )}
            {location.status === 'error' && (
              <span className="uc01-admin-message uc01-admin-message--error" role="alert">
                {location.message}
                <button type="button" className="uc01-admin-button hr-att-inline-button" onClick={() => void findLocation()}>Try location again</button>
              </span>
            )}
          </div>

          {today.geofenced && (
            <p className="hr-att-hint">
              You need to be within {today.geofenceRadiusM} m of one of your outlets. The distance is worked out by the server.
            </p>
          )}
          {expected && (
            <div className="uc01-admin-message uc01-admin-message--info">
              {expected === 'LATE'
                ? `It is after ${formatClock(today.standardTimes.lateAfter)}, so this check-in will be recorded as late and sent for approval.`
                : `It is before ${formatClock(today.standardTimes.checkOutEarliest)}, so this check-out will be recorded as early and sent for approval.`}
            </div>
          )}
          {problem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{problem.message}</div>}
          <div className="uc01-admin-dialog__actions">
            <button type="button" className="uc01-admin-button" onClick={close} disabled={locked}>Cancel</button>
            <button type="button" className="uc01-admin-button uc01-admin-button--primary" onClick={() => void takePhoto()} disabled={!canTakePhoto}>
              {busy === 'photo' ? 'Taking photo…' : 'Take photo'}
            </button>
          </div>
        </>
      )}

      {step === 'review' && shot && (
        <>
          <div className="hr-att-camera hr-att-camera--still">
            {shotUrl && <img src={shotUrl} alt="The photo you took" />}
          </div>
          <p className="hr-att-hint">
            Send this photo within {Math.round(shot.ttlMs / 60000) >= 1 ? `${Math.round(shot.ttlMs / 60000)} minutes` : `${Math.round(shot.ttlMs / 1000)} seconds`}.
            If you are not happy with it, take it again.
          </p>

          {problem && (
            <div
              className={`uc01-admin-message ${problem.next === 'reason' ? 'uc01-admin-message--info' : 'uc01-admin-message--error'}`}
              role="alert"
            >
              {problem.message}
            </div>
          )}

          {(needsReason || expected) && problem?.next !== 'retake' && problem?.next !== 'close' && (
            <div className={`hr-field${reasonMissing ? ' hr-field--error' : ''}`}>
              <label htmlFor="hr-att-reason">
                {needsReason ? 'Reason' : 'Note for your approver (optional)'}
                {needsReason && <span className="hr-field__required"> *</span>}
              </label>
              <textarea
                id="hr-att-reason"
                value={reason}
                maxLength={500}
                rows={3}
                disabled={locked}
                placeholder={needsReason ? 'Why are you not at your outlet?' : 'Anything your approver should know'}
                onChange={(e) => {
                  setReason(e.target.value);
                  setReasonMissing(false);
                }}
              />
              {reasonMissing && <span className="hr-field__error" role="alert">Say why, then send it again.</span>}
            </div>
          )}

          <div className="uc01-admin-dialog__actions">
            {problem?.next === 'close' ? (
              <button type="button" className="uc01-admin-button uc01-admin-button--primary" onClick={close}>Close</button>
            ) : problem?.next === 'retake' ? (
              <>
                <button type="button" className="uc01-admin-button" onClick={close}>Close</button>
                <button type="button" className="uc01-admin-button uc01-admin-button--primary" onClick={retake}>Take a new photo</button>
              </>
            ) : (
              <>
                <button type="button" className="uc01-admin-button" onClick={retake} disabled={locked}>Retake</button>
                <button type="button" className="uc01-admin-button uc01-admin-button--primary" onClick={() => void send()} disabled={locked}>
                  {busy === 'send' ? 'Sending…' : problem?.next === 'reason' ? `Send with reason` : verb}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </DialogShell>
  );
}
