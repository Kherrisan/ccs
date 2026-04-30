import type { LogsEntry, LogsLevel } from '@/lib/api-client';
import type { TraceGroup } from './logs-trace-row';

const LEVEL_RANK: Record<LogsLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface LeafItem {
  kind: 'leaf';
  entry: LogsEntry;
}

export type DerivedItem = LeafItem | TraceGroup;

/**
 * Pure helper: derive a flat list of either standalone leaves or trace groups
 * (entries sharing a `requestId`). Stable, single-pass, O(n).
 *
 * Sort within a group is `ts asc` (defensive — backend may not guarantee it).
 * Group ts = min child ts, used to slot the group amongst standalone leaves.
 * Standalone leaves keep their original `ts` slot — never silently dropped.
 */
export function deriveTraceGroups(entries: LogsEntry[]): DerivedItem[] {
  const groups = new Map<string, LogsEntry[]>();
  const leaves: LeafItem[] = [];
  for (const entry of entries) {
    if (entry.requestId) {
      const bucket = groups.get(entry.requestId);
      if (bucket) bucket.push(entry);
      else groups.set(entry.requestId, [entry]);
    } else {
      leaves.push({ kind: 'leaf', entry });
    }
  }

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
