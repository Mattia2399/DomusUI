import type { LucideIcon } from 'lucide-react';

/** Filled circle in an accent color with a white glyph on top. */
export function IconBadge({
  Icon,
  color,
  size = 28,
  className = '',
}: {
  Icon: LucideIcon;
  color: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-white ${className}`}
      style={{ width: size, height: size, backgroundColor: color }}
    >
      <Icon size={Math.round(size * 0.56)} strokeWidth={2.25} />
    </span>
  );
}

export default IconBadge;
