import React, { useCallback, useRef, useState } from 'react';
import { Input } from './ui/input';

type DateInputProps = {
  value: string; // ISO format yyyy-MM-dd
  onChange: (value: string) => void;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  placeholder?: string;
  min?: string;
  max?: string;
};

/**
 * Date input that always displays dd/MM/yyyy regardless of browser locale.
 * Stores value internally as yyyy-MM-dd (ISO) for API compatibility.
 * Shows a native date picker via a hidden input for calendar popup support.
 */
export default function DateInput({ value, onChange, id, required, disabled, readOnly, className, placeholder, min, max }: DateInputProps) {
  const hiddenRef = useRef<HTMLInputElement>(null);

  // Convert ISO yyyy-MM-dd to dd/MM/yyyy for display
  const toDisplay = useCallback((iso: string) => {
    if (!iso) return '';
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    return iso;
  }, []);

  // Convert dd/MM/yyyy to ISO yyyy-MM-dd
  const toIso = useCallback((display: string) => {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    return display;
  }, []);

  const [displayValue, setDisplayValue] = useState(toDisplay(value));

  // Sync when parent value changes
  React.useEffect(() => {
    setDisplayValue(toDisplay(value));
  }, [value, toDisplay]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDisplayValue(raw);

    // Auto-format: insert slashes as user types
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 8) {
      const formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
      setDisplayValue(formatted);
      const iso = toIso(formatted);
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        onChange(iso);
      }
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
      const iso = toIso(raw);
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        onChange(iso);
      }
    }
  };

  const handleBlur = () => {
    // On blur, try to parse and normalize
    const iso = toIso(displayValue);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const date = new Date(`${iso}T00:00:00`);
      if (!Number.isNaN(date.getTime())) {
        onChange(iso);
        setDisplayValue(toDisplay(iso));
        return;
      }
    }
    // If empty, clear
    if (!displayValue.trim()) {
      onChange('');
      setDisplayValue('');
    }
  };

  const handleCalendarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const iso = e.target.value;
    onChange(iso);
    setDisplayValue(toDisplay(iso));
  };

  const openCalendar = () => {
    if (disabled || readOnly) return;
    hiddenRef.current?.showPicker?.();
  };

  return (
    <div className="relative">
      <Input
        id={id}
        value={displayValue}
        onChange={handleTextChange}
        onBlur={handleBlur}
        placeholder={placeholder || 'dd/MM/yyyy'}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        className={className}
        maxLength={10}
      />
      {!disabled && !readOnly && (
        <>
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            onClick={openCalendar}
            tabIndex={-1}
            aria-label="Open calendar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
          </button>
          <input
            ref={hiddenRef}
            type="date"
            value={value}
            onChange={handleCalendarChange}
            min={min}
            max={max}
            className="absolute inset-0 opacity-0 pointer-events-none"
            tabIndex={-1}
            aria-hidden="true"
          />
        </>
      )}
    </div>
  );
}
