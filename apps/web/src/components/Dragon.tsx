import type { ReactNode } from 'react';

/**
 * SI, the guide: an original futuristic dragon robot. Square robot head with a visor,
 * stubby horns, bolt ears, small violet wings and a curled tail.
 */
export function Dragon({ size = 96, body = 'var(--color-teal)', title }: { size?: number; body?: string; title?: string }) {
  const ink = 'var(--color-ink)';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className="shrink-0"
    >
      {/* wings */}
      <path d="M36 86 C14 78 8 98 30 102 Z" fill="var(--color-violet)" stroke={ink} strokeWidth="4" strokeLinejoin="round" />
      <path d="M84 86 C106 78 112 98 90 102 Z" fill="var(--color-violet)" stroke={ink} strokeWidth="4" strokeLinejoin="round" />
      {/* tail */}
      <path d="M80 106 C98 112 110 102 104 90" fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round" />
      <path d="M98 88 L108 84 L106 95 Z" fill="var(--color-sun)" stroke={ink} strokeWidth="3" strokeLinejoin="round" />
      {/* body and belly plate */}
      <rect x="34" y="76" width="52" height="34" rx="15" fill={body} stroke={ink} strokeWidth="4" />
      <rect x="47" y="84" width="26" height="17" rx="6" fill="var(--color-sun)" stroke={ink} strokeWidth="3" />
      <path d="M52 92 H57 V96 H63 V89 H68" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* horns */}
      <path d="M38 24 L32 6 L50 18 Z" fill="var(--color-sun)" stroke={ink} strokeWidth="4" strokeLinejoin="round" />
      <path d="M82 24 L88 6 L70 18 Z" fill="var(--color-sun)" stroke={ink} strokeWidth="4" strokeLinejoin="round" />
      {/* bolt ears */}
      <circle cx="19" cy="50" r="7" fill="var(--color-mist)" stroke={ink} strokeWidth="4" />
      <circle cx="101" cy="50" r="7" fill="var(--color-mist)" stroke={ink} strokeWidth="4" />
      {/* head */}
      <rect x="22" y="16" width="76" height="64" rx="24" fill={body} stroke={ink} strokeWidth="4" />
      {/* visor and eyes */}
      <rect x="32" y="32" width="56" height="27" rx="13.5" fill={ink} />
      <circle cx="48" cy="45.5" r="5.5" fill="var(--color-sun)" />
      <circle cx="72" cy="45.5" r="5.5" fill="var(--color-sun)" />
      <circle cx="50" cy="43.5" r="1.6" fill="white" />
      <circle cx="74" cy="43.5" r="1.6" fill="white" />
      {/* smile */}
      <path d="M52 67 Q60 73 68 67" fill="none" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

/** SI speaking. The bubble points toward the dragon in both reading directions. */
export function DragonSays({ children, size = 84 }: { children: ReactNode; size?: number }) {
  return (
    <div className="flex items-end gap-3">
      <Dragon size={size} />
      <div className="card-ink relative mb-3 max-w-prose px-5 py-3 text-lg leading-snug">
        {children}
      </div>
    </div>
  );
}
