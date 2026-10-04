import type { ReactNode } from 'react';

interface Props {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  wide?: boolean;
  children: ReactNode;
}

export default function Field({ label, htmlFor, error, hint, required, wide, children }: Props) {
  return (
    <div className={`hr-field${wide ? ' hr-field--wide' : ''}${error ? ' hr-field--error' : ''}`}>
      <label htmlFor={htmlFor}>
        {label}
        {required && <span className="hr-field__required" aria-hidden="true"> *</span>}
      </label>
      {children}
      {error ? (
        <span id={`${htmlFor}-error`} className="hr-field__error" role="alert">{error}</span>
      ) : hint ? (
        <span id={`${htmlFor}-hint`} className="hr-field__hint">{hint}</span>
      ) : null}
    </div>
  );
}
