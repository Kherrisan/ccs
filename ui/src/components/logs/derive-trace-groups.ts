import type { LogsEntry, LogsLevel } from '@/lib/api-client';
import type { TraceGroup } from './logs-trace-row';

const LEVEL_RANK: Record<LogsLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface LeafItem {
  kind: 'leaf';
  entry: LogsEntry;
  /**
   * When >1, this leaf represents N consecutive identical entries that have
   * been coalesced. Row renderer shows a ×N badge so dashboard self-polling
   * floods don't drown real signal.
   */
  repeatCount?: number;
  collapsedRange?: { fromTs: string; toTs: string };
}

export type DerivedItem = LeafItem | TraceGroup;

/**
 * Tuple key for coalescing: two entries are "same enough" to collapse when
 * (event, module, level, requestId, source) all match.
 */
function coalesceKey(entry: LogsEntry): string {
  return [
    entry.event ?? '',
    entry.module ?? entry.source ?? '',
    entry.level,
    entry.requestId ?? '',
    entry.source ?? '',
  ].join(' ');
}

/**
 * Coalesce a list of entries: any run of consecutive entries with identical
 * `coalesceKey` collapses to a single leaf with `repeatCount` set.
 *
 * Conservative — only collapses *adjacent* duplicates. Mixing different
 * events between repeats prevents collapsing on purpose: hiding interleaved
 * signal would be worse than the noise.
 */
function coalesceLeaves(entries: LogsEntry[]): LeafItem[] {
  if (entries.length === 0) return [];
  const out: LeafItem[] = [];
  let runHead: LogsEntry | null = null;
  let runCount = 0;
  let runFromTs = '';
  let runToTs = '';
  let runKey = '';

  const flush = () => {
    if (!runHead) return;
    if (runCount === 1) {
      out.push({ kind: 'leaf', entry: runHead });
    } else {
      out.push({
        kind: 'leaf',
        entry: runHead,
        repeatCount: runCount,
        collapsedRange: { fromTs: runFromTs, toTs: runToTs },
      });
    }
    runHead = null;
    runCount = 0;
  };

  for (const entry of entries) {
    const key = coalesceKey(entry);
    if (runHead && key === runKey) {
      runCount += 1;
      runToTs = entry.timestamp;
    } else {
      flush();
      runHead = entry;
      runCount = 1;
      runFromTs = entry.timestamp;
      runToTs = entry.timestamp;
      runKey = key;
    }
  }
  flush();
  return out;
}

/**
 * For an entry without an explicit `stage` field, derive a short chip label
 * from the event name so the trace timeline still renders meaningful badges
 * instead of empty pills. Last `.`-segment, capped at 12 chars.
 */
export function deriveStageHint(entry: LogsEntry): string | undefined {
  if (entry.stage && entry.stage.length > 0) return entry.stage;
  if (entry.event && entry.event.length > 0) {
    const last = entry.event.split('.').pop() ?? entry.event;
    return last.slice(0, 12);
  }
  return undefined;
}

/**
 * Pure helper: derive a flat list of either standalone leaves or trace groups
 * (entries sharing a `requestId`). Stable, single-pass, O(n).
 *
 * Sort within a group is `ts asc` (defensive — backend may not guarantee it).
 * Group ts = min child ts, used to slot the group amongst standalone leaves.
 * Standalone leaves keep their original `ts` slot — never silently dropped.
 *
 * Standalone leaves are coalesced: consecutive identical entries collapse
 * into a single leaf with `repeatCount` so dashboard self-polling floods
 * don't drown out real signal.
 */
export function deriveTraceGroups(entries: LogsEntry[]): DerivedItem[] {
  const groups = new Map<string, LogsEntry[]>();
  const rawLeaves: LogsEntry[] = [];
  for (const entry of entries) {
    if (entry.requestId) {
      const bucket = groups.get(entry.requestId);
      if (bucket) bucket.push(entry);
      else groups.set(entry.requestId, [entry]);
    } else {
      rawLeaves.push(entry);
    }
  }

  const leaves = coalesceLeaves(rawLeaves);

  const groupItems: TraceGroup[] = [];
  for (const [requestId, children] of groups) {
    const sorted = [...children].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    let maxLevel: LogsLevel = 'debug';
    let total = 0;
    for (const c of sorted) {
      if (LEVEL_RANK[c.level] > LEVEL_RANK[maxLevel]) maxLevel = c.level;
      if (typeof c.latencyMs === 'number') total += c.latencyMs;
    }
    const head = sorted[0];
    if (!head) continue;
    groupItems.push({
      kind: 'trace',
      requestId,
      module: head.module ?? head.source,
      source: head.source,
      ts: head.timestamp,
      maxLevel,
      totalLatencyMs: total,
      children: sorted,
    });
  }

  return [...groupItems, ...leaves].sort((a, b) => {
    const at = a.kind === 'trace' ? a.ts : a.entry.timestamp;
    const bt = b.kind === 'trace' ? b.ts : b.entry.timestamp;
    return bt.localeCompare(at);
  });
}
