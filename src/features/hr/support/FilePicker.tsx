import { useRef } from 'react';

import { fileProblem, MAX_TICKET_FILES, sizeLabel } from '../../../services/hr/tickets';

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

/** Up to five files of 10 MB each, of any kind. The size is checked here and again by HR. */
export default function FilePicker({ files, onChange, disabled }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const problem = fileProblem(files);
  return (
    <div className="hrs-files">
      <input
        ref={input}
        type="file"
        multiple
        disabled={disabled}
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          if (input.current) input.current.value = '';
          onChange([...files, ...picked]);
        }}
      />
      <small>Any file, up to {MAX_TICKET_FILES} files of 10 MB each.</small>
      {files.length > 0 && (
        <ul className="hrs-files__list" aria-label="Files to send">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <span>{file.name} <small>{sizeLabel(file.size)}</small></span>
              <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={disabled} onClick={() => onChange(files.filter((_, i) => i !== index))}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      {problem && <p className="hrs-error" role="alert">{problem}</p>}
    </div>
  );
}
