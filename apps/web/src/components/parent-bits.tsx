import type { ReactNode } from 'react';
import { useApp } from '../lib/app-state.tsx';
import type { Lang } from '../lib/types.ts';

export function LanguageSwitch() {
  const { lang, setParentLang, t } = useApp();
  const other: Lang = lang === 'he' ? 'en' : 'he';
  return (
    <button
      type="button"
      className="btn-parent btn-parent-quiet text-sm"
      onClick={() => setParentLang(other)}
      lang={other}
    >
      {t(`lang.${other}`)}
    </button>
  );
}

export function Field({ label, hint, children, htmlFor }: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block font-display">{label}</label>
      {children}
      {hint && <p className="text-sm text-ink-soft">{hint}</p>}
    </div>
  );
}

/** Two or three mutually exclusive options as a row of toggle buttons. */
export function Choice<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`min-h-11 rounded-[10px] border-[1.5px] px-4 ${
            value === option.value ? 'border-ink bg-ink text-white' : 'border-ink/25 bg-white'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
