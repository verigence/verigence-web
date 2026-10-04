interface Props {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

/** Shown by the salary forms only when `pfIsOptional(gross)`. Ticked means Provident Fund applies (the default). */
export default function PfApplicableField({ id, checked, disabled, onChange }: Props) {
  return (
    <label className="hr-check" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        Provident Fund applies
        <small>Optional for a gross of ₹25,000 or more. Untick if the employee opts out.</small>
      </span>
    </label>
  );
}
