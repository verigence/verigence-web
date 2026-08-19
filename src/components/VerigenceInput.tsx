import { forwardRef, type InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  helperText?: string;
};

const VerigenceInput = forwardRef<HTMLInputElement, Props>(
  ({ id, label, error, helperText, className = '', ...props }, ref) => {
    const inputId = id ?? props.name;
    const descriptionId = inputId ? `${inputId}-description` : undefined;

    return (
      <label className={`verigence-field ${className}`.trim()} htmlFor={inputId}>
        <span className="verigence-field__label">{label}</span>
        <input
          {...props}
          id={inputId}
          ref={ref}
          className={`verigence-input${error ? ' verigence-input--error' : ''}`}
          aria-invalid={Boolean(error)}
          aria-describedby={error || helperText ? descriptionId : undefined}
        />
        {(error || helperText) && (
          <span
            id={descriptionId}
            className={error ? 'verigence-field__error' : 'verigence-field__helper'}
          >
            {error ?? helperText}
          </span>
        )}
      </label>
    );
  },
);

VerigenceInput.displayName = 'VerigenceInput';

export default VerigenceInput;
