import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MonitorGridProps {
  children: ReactNode;
  className?: string;
}

/**
 * MonitorGrid - 12-column responsive grid for MonitorCards.
 *
 * - <640px: single column
 * - <1024px: 6 cols
 * - >=1024px: 12 cols
 *
 * Children should be <MonitorCard span={…}/> using span values 1-12.
 */
export function MonitorGrid({ children, className }: MonitorGridProps) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-6 lg:grid-cols-12', className)}>
      {children}
    </div>
  );
}

type Span = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
type Variant = 'default' | 'terminal';

interface MonitorCardProps {
  /** Column span in MonitorGrid (1-12). Default 4. */
  span?: Span;
  variant?: Variant;
  title?: ReactNode;
  description?: ReactNode;
  /** Trailing actions in card header. */
  actions?: ReactNode;
  /** Optional meta line (e.g. timeframe, count) shown next to actions. */
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}

// Tailwind needs literal class names — map span -> class explicitly so JIT picks them up.
const SPAN_DESKTOP: Record<Span, string> = {
  1: 'lg:col-span-1',
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
  5: 'lg:col-span-5',
  6: 'lg:col-span-6',
  7: 'lg:col-span-7',
  8: 'lg:col-span-8',
  9: 'lg:col-span-9',
  10: 'lg:col-span-10',
  11: 'lg:col-span-11',
  12: 'lg:col-span-12',
};

// Tablet: clamp span to 6 cols max.
const SPAN_TABLET: Record<Span, string> = {
  1: 'sm:col-span-2',
  2: 'sm:col-span-2',
  3: 'sm:col-span-3',
  4: 'sm:col-span-3',
  5: 'sm:col-span-3',
  6: 'sm:col-span-6',
  7: 'sm:col-span-6',
  8: 'sm:col-span-6',
  9: 'sm:col-span-6',
  10: 'sm:col-span-6',
  11: 'sm:col-span-6',
  12: 'sm:col-span-6',
};

const VARIANT_CLASSES: Record<Variant, string> = {
  default: 'bg-card text-card-foreground',
  terminal: 'bg-zinc-950 text-emerald-400 border-emerald-900/40 font-mono',
};

/**
 * MonitorCard - Single tile in a MonitorGrid.
 *
 * Variants:
 * - default: standard card
 * - terminal: dark monospace card for "live log" / health-style tiles
 */
export function MonitorCard({
  span = 4,
  variant = 'default',
  title,
  description,
  actions,
  meta,
  children,
  className,
}: MonitorCardProps) {
  return (
    <article
      data-variant={variant}
      className={cn(
        'col-span-1 flex flex-col gap-3 rounded-xl border p-4 shadow-sm',
        SPAN_TABLET[span],
        SPAN_DESKTOP[span],
        VARIANT_CLASSES[variant],
        className
      )}
    >
      {(title || actions || meta) && (
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h3
                className={cn(
                  'truncate text-sm font-semibold',
                  variant === 'terminal' && 'text-emerald-300'
                )}
              >
                {title}
              </h3>
            )}
            {description && (
              <p
                className={cn(
                  'mt-0.5 text-xs',
                  variant === 'terminal' ? 'text-emerald-500/70' : 'text-muted-foreground'
                )}
              >
                {description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {meta && (
              <span
                className={cn(
                  'text-xs',
                  variant === 'terminal' ? 'text-emerald-500/70' : 'text-muted-foreground'
                )}
              >
                {meta}
              </span>
            )}
            {actions}
          </div>
        </header>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </article>
  );
}
