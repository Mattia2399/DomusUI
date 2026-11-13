import { useId } from 'react';

/** Domus UI mark, inlined from brand/icon.svg so it inherits sizing and stays crisp. */
export function DomusMark({ className = 'h-8 w-8', title }: { className?: string; title?: string }) {
  const uid = useId().replace(/:/g, '');
  const bg = `domus-bg-${uid}`;
  const glass = `domus-glass-${uid}`;
  return (
    <svg
      viewBox="0 0 256 256"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id={bg} x1="32" y1="18" x2="222" y2="238" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5BA8FF" />
          <stop offset="0.5" stopColor="#1768D5" />
          <stop offset="1" stopColor="#0A2457" />
        </linearGradient>
        <linearGradient id={glass} x1="78" y1="65" x2="176" y2="194" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity="0.96" />
          <stop offset="0.48" stopColor="white" stopOpacity="0.72" />
          <stop offset="1" stopColor="white" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="240" height="240" rx="68" fill={`url(#${bg})`} />
      <path
        d="M19 80C42 29 88 16 126 16c57 0 89 30 111 70-41-20-75-20-109-5-35 15-66 16-109-1Z"
        fill="white"
        opacity="0.13"
      />
      <path
        d="M58 125.5 128 66l70 59.5"
        fill="none"
        stroke={`url(#${glass})`}
        strokeWidth="18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M78 116v72c0 6.6 5.4 12 12 12h76c6.6 0 12-5.4 12-12v-72"
        fill="none"
        stroke={`url(#${glass})`}
        strokeWidth="18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M113 200v-49c0-8.3 6.7-15 15-15s15 6.7 15 15v49"
        fill="none"
        stroke="white"
        strokeOpacity="0.78"
        strokeWidth="15"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Outline-only house glyph from the mark, used as a large decorative line drawing. */
export const DOMUS_GLYPH_PATHS = [
  'M58 125.5 128 66l70 59.5',
  'M78 116v72c0 6.6 5.4 12 12 12h76c6.6 0 12-5.4 12-12v-72',
  'M113 200v-49c0-8.3 6.7-15 15-15s15 6.7 15 15v49',
] as const;
