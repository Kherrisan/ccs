import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface KpiRowProps {
  children: ReactNode;
  className?: string;
}

/**
 * KpiRow - Container row for hero stat tiles.
 *
 * Use only when there are ≤4 hero numbers. More than 4 → consider grouping into a card grid.
 * Responsive: 2 cols on mobile, 4 on desktop.
 */
export function KpiRow({ children, className }: KpiRowProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4', className)}>
      {children}
    </div>
  );
}

interface KpiCardProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  /** Tone for the hint line (e.g. positive delta, warning, etc.). */
  tone?: 'default' | 'positive' | 'warning' | 'negative';
  icon?: ReactNode;
  /**
   * Optional click handler. When set, the tile renders as a button with
   * keyboard + hover affordances — used by pages where each KPI is also a
   * navigation entry point (e.g. home dashboard).
   */
  onClick?: () => void;
  /** Accessible label override when onClick is set. Defaults to `label`. */
  ariaLabel?: string;
  className?: string;
}

const TONE_CLASSES: Record<NonNullable<KpiCardProps['tone']>, string> = {
  default: 'text-muted-foreground',
  positive: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  negative: 'text-destructive',
};

/**
 * KpiCard - Single hero stat tile inside a KpiRow.
 *
 * Renders as a static <div> by default; promotes to a clickable <button>
 * when `onClick` is supplied so the tile gains keyboard focus + hover state.
 */
export function KpiCard({
  label,
  value,
  hint,
  tone = 'default',
  icon,
  onClick,
  ariaLabel,
  className,
}: KpiCardProps) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className={cn('mt-1 text-xs', TONE_CLASSES[tone])}>{hint}</p>}
    </>
  );

  const baseClasses = 'rounded-xl border bg-card p-4 shadow-sm';

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        className={cn(
          baseClasses,
          'text-left transition-all hover:bg-card/80 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className
        )}
      >
        {content}
      </button>
    );
  }

  return <div className={cn(baseClasses, className)}>{content}</div>;
}
