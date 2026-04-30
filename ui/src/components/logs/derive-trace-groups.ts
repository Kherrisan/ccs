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
 * Tuple key for coalescing. Includes `message` so two adjacent logs that
 * share event/module/level but report different content stay distinct
 * (e.g. `User logged in: alice` and `User logged in: bob`). Excludes
 * `latencyMs` and `metadata` because those drift per request even on
 * truly redundant polls — including them would prevent any coalescing.
 */
function coalesceKey(entry: LogsEntry): string {
  return [
    entry.event ?? '',
    entry.message ?? '',
    entry.module ?? entry.source ?? '',
    entry.level,
    entry.requestId ?? '',
    entry.source ?? '',
  ].join(' ');
}

/**
 * Coalesce identical consecutive children inside a single trace.
 *
 * Key tuple includes `message` so two children that share
 * event/stage/level/module but report different content stay visible as
 * separate rows. Includes `source` so adjacent rows from different
 * services with otherwise-identical fields stay distinct (a request can
 * fan out across multiple sources participating in the same trace).
 * Excludes `latencyMs` — it drifts per request and would defeat the
 * dedup on truly redundant polls.
 *
 * Exported so it can be unit-tested independently from the React row.
 */
export function coalesceChildren(children: LogsEntry[]): Array<{ head: LogsEntry; count: number }> {
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
    const k = [
      child.event ?? '',
      child.message ?? '',
      child.stage ?? '',
      child.level,
      child.module ?? '',
      child.source ?? '',
    ].join(' ');
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
 * Pure helper: derive a list of either standalone leaves or trace groups
 * (entries sharing a `requestId`).
 *
 * Single-pass, O(n). Walks `entries` in input order so leaf coalescing
 * sees the *real* adjacency: a leaf only extends the previous leaf when
 * no other entry (trace child included) appeared between them. This
 * preserves signal — two identical no-requestId entries split by an
 * unrelated trace stay as two separate rows, not a fake `×2`.
 *
 * Trace groups gather all children sharing a requestId regardless of
 * interleaving; they're sorted by `ts asc` before display, with the
 * group's positional `ts` set to the oldest child so it slots correctly
 * in the reverse-chronological display sort below.
 */
export function deriveTraceGroups(entries: LogsEntry[]): DerivedItem[] {
  const items: DerivedItem[] = [];
  const traceIndex = new Map<string, number>(); // requestId -> index in items
  let lastLeafIdx = -1;
  let lastLeafKey = '';

  for (const entry of entries) {
    if (entry.requestId) {
      // Trace child. Append to existing group or create one.
      const existingIdx = traceIndex.get(entry.requestId);
      if (existingIdx !== undefined) {
        (items[existingIdx] as TraceGroup).children.push(entry);
      } else {
        const grp: TraceGroup = {
          kind: 'trace',
          requestId: entry.requestId,
          module: entry.module ?? entry.source,
          source: entry.source,
          ts: entry.timestamp,
          maxLevel: entry.level,
          totalLatencyMs: 0,
          children: [entry],
        };
        items.push(grp);
        traceIndex.set(entry.requestId, items.length - 1);
      }
      // A trace entry breaks any leaf-run adjacency.
      lastLeafIdx = -1;
      lastLeafKey = '';
    } else {
      // Standalone leaf.
      const key = coalesceKey(entry);
      if (lastLeafIdx >= 0 && key === lastLeafKey) {
        const prev = items[lastLeafIdx] as LeafItem;
        prev.repeatCount = (prev.repeatCount ?? 1) + 1;
        prev.collapsedRange = {
          fromTs: prev.collapsedRange?.fromTs ?? prev.entry.timestamp,
          toTs: entry.timestamp,
        };
      } else {
        const leaf: LeafItem = { kind: 'leaf', entry };
        items.push(leaf);
        lastLeafIdx = items.length - 1;
        lastLeafKey = key;
      }
    }
  }

  // Finalize trace groups: sort children, compute aggregates, set group ts.
  for (const item of items) {
    if (item.kind === 'trace') {
      item.children.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      let maxLevel: LogsLevel = 'debug';
      let total = 0;
      for (const c of item.children) {
        if (LEVEL_RANK[c.level] > LEVEL_RANK[maxLevel]) maxLevel = c.level;
        if (typeof c.latencyMs === 'number') total += c.latencyMs;
      }
      item.maxLevel = maxLevel;
      item.totalLatencyMs = total;
      const head = item.children[0];
      if (head) item.ts = head.timestamp;
    }
  }

  // Display sort: newest first.
  return items.sort((a, b) => {
    const at = a.kind === 'trace' ? a.ts : a.entry.timestamp;
    const bt = b.kind === 'trace' ? b.ts : b.entry.timestamp;
    return bt.localeCompare(at);
  });
}
