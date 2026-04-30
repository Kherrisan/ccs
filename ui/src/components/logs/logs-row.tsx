import { memo, useState, type KeyboardEvent } from 'react';
import { Copy } from 'lucide-react';
import type { LogsEntry } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { LogLevelBadge } from './log-level-badge';
import { FOCUS_RING, MONO_NUMERIC, ROW_DENSITY, ROW_INTERACTIVE, type RowDensity } from './tokens';
import { getDisplayLatency, getDisplayModule, getDisplayRequestId } from './utils';

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
  /** Optional repeat counter — when the row coalesces N identical consecutive entries. */
  repeatCount?: number;
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

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // best-effort; clipboard may be unavailable in non-secure contexts
  }
}

function LogsRowImpl({
  entry,
  isSelected,
  density,
  sourceLabel,
  onSelect,
  indent = 0,
  stageHint,
  repeatCount,
}: LogsRowProps) {
  const [justCopied, setJustCopied] = useState(false);
  const moduleLabel = getDisplayModule(entry, sourceLabel);
  const latencyLabel = getDisplayLatency(entry);
  const shortRequestId = getDisplayRequestId(entry, { short: true });

  const handleSelect = () => onSelect(entry.id);
  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect();
    }
  };

  const handleCopyRequestId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!entry.requestId) return;
    await copyText(entry.requestId);
    setJustCopied(true);
    window.setTimeout(() => setJustCopied(false), 1200);
  };

  // Row is a focusable div (not a button) so it can host a real <button>
  // for the copy-requestId affordance — nesting interactive elements
  // inside a <button> is invalid HTML and breaks keyboard focus order.
  return (
    <div
      role="row"
      tabIndex={0}
      aria-selected={isSelected}
      data-selected={isSelected}
      onClick={handleSelect}
      onKeyDown={handleKey}
      style={{ paddingLeft: 12 + indent }}
      className={cn(
        'group flex w-full cursor-pointer items-center gap-3 border-b border-border/50 pr-3 text-left',
        ROW_DENSITY[density],
        ROW_INTERACTIVE,
        FOCUS_RING,
        isSelected && 'bg-muted/60 shadow-[inset_2px_0_0_var(--ring)]'
      )}
    >
      {/* Leading 16px slot mirrors the trace-row chevron column so leaf
          rows align under the same column edges as trace rows. */}
      <span className="w-4 shrink-0" aria-hidden="true" />
      <span
        role="cell"
        className={cn('w-[88px] shrink-0 truncate text-[12px] text-muted-foreground', MONO_NUMERIC)}
      >
        {formatHms(entry.timestamp)}
      </span>
      <span role="cell" className="flex w-[64px] shrink-0 items-center">
        <LogLevelBadge level={entry.level} />
      </span>
      {stageHint ? (
        <span
          role="cell"
          className="w-[72px] shrink-0 truncate rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground"
        >
          {stageHint}
        </span>
      ) : null}
      <span
        role="cell"
        className="w-[140px] shrink-0 truncate text-[12px] font-medium text-foreground/80"
      >
        {moduleLabel}
      </span>
      <span role="cell" className="min-w-0 flex-1 truncate text-[13px] text-foreground/90">
        {entry.message}
        {repeatCount && repeatCount > 1 ? (
          <span
            className="ml-2 inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
            title={`${repeatCount} consecutive identical entries`}
          >
            ×{repeatCount}
          </span>
        ) : null}
      </span>
      <span
        role="cell"
        className={cn(
          'hidden w-[72px] shrink-0 truncate text-right text-[12px] text-muted-foreground sm:inline-block',
          MONO_NUMERIC
        )}
      >
        {latencyLabel === '—' ? '' : latencyLabel}
      </span>
      <span
        role="cell"
        className={cn(
          'hidden w-[112px] shrink-0 items-center justify-end gap-1 text-right text-[12px] text-muted-foreground/80 lg:inline-flex',
          MONO_NUMERIC
        )}
      >
        {entry.requestId ? (
          <>
            <span className="truncate">{shortRequestId}</span>
            <button
              type="button"
              aria-label={justCopied ? 'Copied requestId' : 'Copy requestId'}
              title={justCopied ? 'Copied' : 'Copy requestId'}
              onClick={handleCopyRequestId}
              className={cn(
                'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/50 opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100',
                FOCUS_RING,
                justCopied && 'text-emerald-600 opacity-100'
              )}
            >
              <Copy className="h-3 w-3" aria-hidden="true" />
            </button>
          </>
        ) : null}
      </span>
    </div>
  );
}

export const LogsRow = memo(LogsRowImpl, (prev, next) => {
  return (
    prev.entry.id === next.entry.id &&
    prev.isSelected === next.isSelected &&
    prev.density === next.density &&
    prev.indent === next.indent &&
    prev.stageHint === next.stageHint &&
    prev.sourceLabel === next.sourceLabel &&
    prev.repeatCount === next.repeatCount
  );
});
