import { memo } from 'react';
import { ChevronDown, ChevronRight, GitBranch } from 'lucide-react';
import type { LogsEntry, LogsLevel } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { deriveStageHint } from './derive-trace-groups';
import { LogLevelBadge } from './log-level-badge';
import { LogsRow } from './logs-row';
import { FOCUS_RING, MONO_NUMERIC, ROW_DENSITY, ROW_INTERACTIVE, type RowDensity } from './tokens';

export interface TraceGroup {
  kind: 'trace';
  requestId: string;
  module: string;
  source: string;
  ts: string; // min child ts
  maxLevel: LogsLevel;
  totalLatencyMs: number;
  children: LogsEntry[];
}

export interface LogsTraceRowProps {
  group: TraceGroup;
  isExpanded: boolean;
  selectedEntryId: string | null;
  density: RowDensity;
  sourceLabel: string;
  onToggle: (requestId: string) => void;
  onSelect: (entryId: string) => void;
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

/**
 * Coalesce identical consecutive children inside a single trace. Same key
 * tuple as standalone-leaf coalescing — `(event, stage, level)` since all
 * children share `requestId` already.
 */
function coalesceChildren(children: LogsEntry[]): Array<{ head: LogsEntry; count: number }> {
  if (children.length === 0) return [];
  const out: Array<{ head: LogsEntry; count: number }> = [];
  let head: LogsEntry | null = null;
  let count = 0;
  let key = '';
  const flush = () => {
    if (head) out.push({ head, count });
    head = null;
    count = 0;
  };
  for (const child of children) {
    const k = `${child.event ?? ''}|${child.stage ?? ''}|${child.level}|${child.module ?? ''}`;
    if (head && k === key) {
      count += 1;
    } else {
      flush();
      head = child;
      count = 1;
      key = k;
    }
  }
  flush();
  return out;
}

function LogsTraceRowImpl({
  group,
  isExpanded,
  selectedEntryId,
  density,
  sourceLabel,
  onToggle,
  onSelect,
}: LogsTraceRowProps) {
  const Chevron = isExpanded ? ChevronDown : ChevronRight;
  return (
    <div role="rowgroup" className="border-b border-border/50">
      <button
        type="button"
        role="row"
        aria-expanded={isExpanded}
        onClick={() => onToggle(group.requestId)}
        className={cn(
          'flex w-full items-center gap-3 pl-3 pr-3 text-left',
          ROW_DENSITY[density],
          ROW_INTERACTIVE,
          FOCUS_RING
        )}
      >
        {/* Reserve the same 16px slot as leaf rows so all columns align. */}
        <span className="flex w-4 shrink-0 items-center justify-center" aria-hidden="true">
          <Chevron className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
        <span
          role="cell"
          className={cn(
            'w-[88px] shrink-0 truncate text-[12px] text-muted-foreground',
            MONO_NUMERIC
          )}
        >
          {formatHms(group.ts)}
        </span>
        <span role="cell" className="flex w-[64px] shrink-0 items-center">
          <LogLevelBadge level={group.maxLevel} />
        </span>
        <span
          role="cell"
          className="flex w-[140px] shrink-0 items-center gap-1.5 truncate text-[12px] font-medium text-foreground/80"
        >
          <GitBranch className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          {group.module}
        </span>
        <span role="cell" className="min-w-0 flex-1 truncate text-[13px] text-foreground/90">
          <span className="text-muted-foreground">trace · {group.children.length} stages</span>
        </span>
        <span
          role="cell"
          className={cn(
            'hidden w-[72px] shrink-0 truncate text-right text-[12px] text-muted-foreground sm:inline-block',
            MONO_NUMERIC
          )}
        >
          {group.totalLatencyMs > 0 ? `${group.totalLatencyMs}ms` : ''}
        </span>
        <span
          role="cell"
          className={cn(
            'hidden w-[112px] shrink-0 truncate text-right text-[12px] text-muted-foreground lg:inline-block',
            MONO_NUMERIC
          )}
        >
          {group.requestId.slice(-8)}
        </span>
      </button>
      {isExpanded
        ? coalesceChildren(group.children).map((run) => (
            <LogsRow
              key={run.head.id}
              entry={run.head}
              isSelected={run.head.id === selectedEntryId}
              density={density}
              sourceLabel={sourceLabel}
              onSelect={onSelect}
              indent={20}
              stageHint={deriveStageHint(run.head)}
              repeatCount={run.count > 1 ? run.count : undefined}
            />
          ))
        : null}
    </div>
  );
}

export const LogsTraceRow = memo(LogsTraceRowImpl);
