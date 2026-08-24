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
  const [referenceData, setReferenceData] = useState<ProjectReferenceData>({
    oems: [],
    segments: [],
  });
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

  const selectedOemExists = useMemo(
    () => referenceData.oems.some((item) => item.oemId === oemId),
    [oemId, referenceData.oems],
  );

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
          onChange={(event) => onOemChange(event.target.value)}
        >
          <option value="">{loading ? 'Loading OEMs…' : 'Select OEM'}</option>
          {oemId && !selectedOemExists && <option value={oemId}>Current selection</option>}
          {referenceData.oems.map((item) => (
            <option key={item.oemId} value={item.oemId}>{item.oemName}</option>
          ))}
        </select>
      </label>

      <fieldset className="uc02-field uc02-segment-field" disabled={disabled || loading}>
        <legend>Segments</legend>
        <small>Select one or more Segments. Segment choices are universal and do not depend on OEM.</small>
        {referenceData.segments.length > 0 ? (
          <div className="uc02-segment-options">
            {referenceData.segments.map((segment) => (
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
        ) : (
          !loading && <small>No active Segments are configured.</small>
        )}
      </fieldset>
    </>
  );
}
