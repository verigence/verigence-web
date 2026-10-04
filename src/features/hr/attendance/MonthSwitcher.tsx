import { useMemo } from 'react';

import { currentMonthIst, formatMonth, shiftMonth } from './attendanceFormat';

interface Props {
  month: string;
  onChange: (month: string) => void;
  disabled?: boolean;
  /** How many months back the list goes. */
  span?: number;
}

/** Previous / month list / next. A list rather than <input type="month">, which Safari and Firefox do not draw. */
export default function MonthSwitcher({ month, onChange, disabled = false, span = 18 }: Props) {
  const current = currentMonthIst();
  const options = useMemo(() => {
    const list: string[] = [];
    for (let i = 0; i < span; i += 1) list.push(shiftMonth(current, -i));
    if (!list.includes(month)) list.push(month);
    return list;
  }, [current, month, span]);
  const oldest = options[options.length - 1];

  return (
    <div className="hr-att-months" role="group" aria-label="Month">
      <button
        type="button"
        className="uc01-admin-button hr-att-months__step"
        aria-label="Previous month"
        disabled={disabled || month <= oldest}
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        ‹
      </button>
      <label className="hr-att-months__select">
        <span className="hr-visually-hidden">Choose month</span>
        <select value={month} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {options.map((value) => (
            <option key={value} value={value}>{formatMonth(value)}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="uc01-admin-button hr-att-months__step"
        aria-label="Next month"
        disabled={disabled || month >= current}
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        ›
      </button>
    </div>
  );
}
