import { useEffect, useMemo, useState } from 'react';

import { auditCoreErrorMessage } from '../../services/audit-core/errorMessage';
import {
  getProjectReferenceData,
  type ProjectReferenceData,
} from '../../services/audit-core/projectReferenceData';
import { useSessionStore } from '../../store/sessionStore';

interface ProjectReferenceFieldsProps {
  oemId: string;
  segmentIds: string[];
  disabled: boolean;
  onOemChange: (oemId: string) => void;
  onSegmentsChange: (segmentIds: string[]) => void;
  onError: (message: string) => void;
}

export default function ProjectReferenceFields({
  oemId,
  segmentIds,
  disabled,
  onOemChange,
  onSegmentsChange,
  onError,
}: ProjectReferenceFieldsProps) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const [referenceData, setReferenceData] = useState<ProjectReferenceData>({ oems: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLoading(true);
    void getProjectReferenceData(accessToken)
      .then((value) => {
        if (!cancelled) setReferenceData(value);
      })
      .catch((error: unknown) => {
        if (!cancelled) onError(auditCoreErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, onError]);

  const selectedOem = useMemo(
    () => referenceData.oems.find((item) => item.oemId === oemId) || null,
    [oemId, referenceData.oems],
  );
  const selectedOemExists = Boolean(selectedOem);

  function toggleSegment(segmentId: string, checked: boolean) {
    onSegmentsChange(
      checked
        ? [...new Set([...segmentIds, segmentId])]
        : segmentIds.filter((value) => value !== segmentId),
    );
  }

  return (
    <>
      <label className="uc02-field">
        <span>OEM</span>
        <select
          required
          disabled={disabled || loading}
          value={oemId}
          onChange={(event) => {
            onOemChange(event.target.value);
            onSegmentsChange([]);
          }}
        >
          <option value="">{loading ? 'Loading OEMs…' : 'Select OEM'}</option>
          {oemId && !selectedOemExists && <option value={oemId}>Current selection</option>}
          {referenceData.oems.map((item) => (
            <option key={item.oemId} value={item.oemId}>{item.oemName}</option>
          ))}
        </select>
      </label>

      <fieldset className="uc02-field uc02-segment-field" disabled={disabled || loading || !oemId}>
        <legend>Segments</legend>
        {!oemId && <small>Select an OEM first.</small>}
        {oemId && selectedOem?.segments.length === 0 && (
          <small>No Segment choices are configured for this OEM.</small>
        )}
        {selectedOem?.segments.length ? (
          <div className="uc02-segment-options">
            {selectedOem.segments.map((segment) => (
              <label key={segment.segmentId} className="uc02-segment-option">
                <input
                  type="checkbox"
                  checked={segmentIds.includes(segment.segmentId)}
                  onChange={(event) => toggleSegment(segment.segmentId, event.target.checked)}
                />
                <span>
                  <strong>{segment.segmentName}</strong>
                  <small>{segment.segmentCode.replaceAll('_', ' ')}</small>
                </span>
              </label>
            ))}
          </div>
        ) : null}
      </fieldset>
    </>
  );
}
