import { memo } from 'react';
import type { LogsEntry } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { LogLevelBadge } from './log-level-badge';
import { FOCUS_RING, MONO_NUMERIC, ROW_DENSITY, ROW_INTERACTIVE, type RowDensity } from './tokens';

export interface LogsRowProps {
  entry: LogsEntry;
  isSelected: boolean;
  density: RowDensity;
  sourceLabel: string;
  onSelect: (entryId: string) => void;
  /** Optional indent (px) when row sits inside an expanded trace. */
  indent?: number;
  /** Optional stage chip text (e.g. for child rows of a trace). */
  stageHint?: string;
}

function formatHms(timestamp: string): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return timestamp;
  return d.toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function LogsRowImpl({
  entry,
  isSelected,
  density,
  sourceLabel,
  onSelect,
  indent = 0,
  stageHint,
}: LogsRowProps) {
  return (
    <button
      type="button"
      role="row"
      aria-selected={isSelected}
      data-selected={isSelected}
      onClick={() => onSelect(entry.id)}
      style={{ paddingLeft: 12 + indent }}
      className={cn(
        'flex w-full items-center gap-3 border-b border-border/50 pr-3 text-left',
        ROW_DENSITY[density],
        ROW_INTERACTIVE,
        FOCUS_RING,
        isSelected && 'bg-muted/60 shadow-[inset_2px_0_0_var(--ring)]'
      )}
    >
      <span
        role="cell"
        className={cn('w-[88px] shrink-0 truncate text-[11px] text-muted-foreground', MONO_NUMERIC)}
      >
        {formatHms(entry.timestamp)}
      </span>
      <span role="cell" className="flex w-[64px] shrink-0 items-center">
        <LogLevelBadge level={entry.level} />
      </span>
      {stageHint ? (
        <span
          role="cell"
          className="w-[72px] shrink-0 truncate rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
        >
          {stageHint}
        </span>
      ) : null}
      <span
        role="cell"
        className="w-[140px] shrink-0 truncate text-[11px] font-medium text-foreground/80"
      >
        {entry.module ?? sourceLabel}
      </span>
      <span role="cell" className="min-w-0 flex-1 truncate text-foreground/90">
        {entry.message}
      </span>
      <span
        role="cell"
        className={cn(
          'hidden w-[72px] shrink-0 truncate text-right text-[11px] text-muted-foreground sm:inline-block',
          MONO_NUMERIC
        )}
      >
        {entry.latencyMs !== undefined && entry.latencyMs !== null ? `${entry.latencyMs}ms` : ''}
      </span>
      <span
        role="cell"
        className={cn(
          'hidden w-[88px] shrink-0 truncate text-right text-[11px] text-muted-foreground/80 lg:inline-block',
          MONO_NUMERIC
        )}
      >
        {entry.requestId ? entry.requestId.slice(-8) : ''}
      </span>
    </button>
  );
}

export const LogsRow = memo(LogsRowImpl, (prev, next) => {
  return (
    prev.entry.id === next.entry.id &&
    prev.isSelected === next.isSelected &&
    prev.density === next.density &&
    prev.indent === next.indent &&
    prev.stageHint === next.stageHint &&
    prev.sourceLabel === next.sourceLabel
  );
});
