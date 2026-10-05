import { useState } from 'react';
import { Dragon } from './Dragon.tsx';

/** Characters a child can pick. Drawn locally; children never upload pictures. */
export const AVATARS: Array<{ id: string; color: string }> = [
  { id: 'dragon-teal', color: 'var(--color-teal)' },
  { id: 'dragon-violet', color: 'var(--color-violet)' },
  { id: 'dragon-sun', color: 'var(--color-sun)' },
  { id: 'dragon-coral', color: 'var(--color-coral)' },
  { id: 'dragon-leaf', color: 'var(--color-leaf)' },
  { id: 'dragon-mist', color: 'var(--color-mist)' },
];

export function Avatar({ id, size = 64 }: { id: string; size?: number }) {
  const color = AVATARS.find((a) => a.id === id)?.color ?? 'var(--color-teal)';
  return <Dragon size={size} body={color} />;
}

/** Nine pictures; a PIN is four taps, stored by the database as digits 0-8. */
export const PIN_PICTURES = ['🍎', '🐱', '⭐', '🚀', '🌈', '🐟', '🎈', '🌙', '🍕'];

export function PinPad({
  onComplete,
  disabled,
  label,
}: {
  onComplete: (pin: string) => void;
  disabled?: boolean;
  label: string;
}) {
  const [picked, setPicked] = useState<number[]>([]);

  const tap = (index: number) => {
    if (disabled) return;
    const next = [...picked, index];
    if (next.length === 4) {
      setPicked([]);
      onComplete(next.join(''));
    } else {
      setPicked(next);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-3" aria-live="polite" aria-label={`${picked.length}/4`}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`size-5 rounded-full border-[2.5px] border-ink ${i < picked.length ? 'bg-teal' : 'bg-white'}`}
          />
        ))}
      </div>
      <div role="group" aria-label={label} className="mx-auto grid max-w-xs grid-cols-3 gap-3">
        {PIN_PICTURES.map((picture, index) => (
          <button
            key={picture}
            type="button"
            className="sticker sticker-quiet aspect-square text-4xl"
            onClick={() => tap(index)}
            disabled={disabled}
            aria-label={`${index + 1}`}
          >
            <span aria-hidden="true">{picture}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
