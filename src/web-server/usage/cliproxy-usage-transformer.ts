/**
 * CLIProxy Usage Transformer
 *
 * Transforms CLIProxy's usage API response into DailyUsage/HourlyUsage/MonthlyUsage
 * types compatible with the CCS analytics dashboard.
 */

import type { CliproxyUsageApiResponse, CliproxyRequestDetail } from '../../cliproxy/stats-fetcher';
import { calculateCost } from '../model-pricing';
import type { ModelBreakdown, DailyUsage, HourlyUsage, MonthlyUsage } from './types';

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/** Persisted request detail used to rebuild historical CLIProxy analytics buckets */
export interface CliproxyUsageHistoryDetail {
  model: string;
  timestamp: string;
  source: string;
  authIndex: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  requestCount: number;
  cost: number;
  failed: boolean;
}

/** Accumulator for token counts per model per time bucket */
interface ModelAccumulator {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cost: number;
}

/** Build ModelBreakdown from accumulated token counts */
function buildModelBreakdown(modelName: string, acc: ModelAccumulator): ModelBreakdown {
  const { inputTokens, outputTokens, cacheReadTokens, cost } = acc;
  return { modelName, inputTokens, outputTokens, cacheCreationTokens: 0, cacheReadTokens, cost };
}

function createHistoryDetail(
  model: string,
  detail: CliproxyRequestDetail
): CliproxyUsageHistoryDetail {
  return {
    model,
    timestamp: detail.timestamp,
    source: detail.source,
    authIndex: String(detail.auth_index),
    inputTokens: detail.tokens?.input_tokens ?? 0,
    outputTokens: detail.tokens?.output_tokens ?? 0,
    cacheReadTokens: detail.tokens?.cached_tokens ?? 0,
    requestCount: 1,
    cost: calculateCost(
      {
        inputTokens: detail.tokens?.input_tokens ?? 0,
        outputTokens: detail.tokens?.output_tokens ?? 0,
        cacheCreationTokens: 0,
        cacheReadTokens: detail.tokens?.cached_tokens ?? 0,
      },
      model
    ),
    failed: detail.failed,
  };
}

// ============================================================================
// FLATTEN
// ============================================================================

function hasTrackedUsage(detail: CliproxyRequestDetail): boolean {
  const tokens = detail.tokens;
  return (
    (tokens?.input_tokens ?? 0) > 0 ||
    (tokens?.output_tokens ?? 0) > 0 ||
    (tokens?.cached_tokens ?? 0) > 0
  );
}

/**
 * Flatten the nested response.usage.apis[provider].models[model].details[]
 * structure into normalized history details. Failed requests are retained only
 * when they still report tracked token usage that analytics can account for.
 */
export function extractCliproxyUsageHistoryDetails(
  response: CliproxyUsageApiResponse
): CliproxyUsageHistoryDetail[] {
  const apis = response?.usage?.apis;
  if (!apis) return [];

  const results: CliproxyUsageHistoryDetail[] = [];
  for (const providerData of Object.values(apis)) {
    const models = providerData?.models;
    if (!models) continue;
    for (const [model, modelData] of Object.entries(models)) {
      const details = modelData?.details;
      if (!details) continue;
      for (const detail of details) {
        if (detail.failed && !hasTrackedUsage(detail)) continue;
        results.push(createHistoryDetail(model, detail));
      }
    }
  }
  return results;
}

function createHistorySignature(detail: CliproxyUsageHistoryDetail): string {
  return [
    detail.model,
    detail.timestamp,
    detail.source,
    detail.authIndex,
    detail.inputTokens,
    detail.outputTokens,
    detail.cacheReadTokens,
    detail.requestCount,
    detail.failed ? '1' : '0',
  ].join('|');
}

export function mergeCliproxyUsageHistoryDetails(
  existing: CliproxyUsageHistoryDetail[],
  incoming: CliproxyUsageHistoryDetail[]
): CliproxyUsageHistoryDetail[] {
  const existingCounts = new Map<string, { detail: CliproxyUsageHistoryDetail; count: number }>();
  for (const detail of existing) {
    const signature = createHistorySignature(detail);
    const entry = existingCounts.get(signature);
    if (entry) {
      entry.count += 1;
    } else {
      existingCounts.set(signature, { detail, count: 1 });
    }
  }

  const incomingCounts = new Map<string, { detail: CliproxyUsageHistoryDetail; count: number }>();
  for (const detail of incoming) {
    const signature = createHistorySignature(detail);
    const entry = incomingCounts.get(signature);
    if (entry) {
      entry.count += 1;
    } else {
      incomingCounts.set(signature, { detail, count: 1 });
    }
  }

  for (const [signature, incomingEntry] of incomingCounts) {
    const existingEntry = existingCounts.get(signature);
    if (!existingEntry || incomingEntry.count > existingEntry.count) {
      existingCounts.set(signature, {
        detail: incomingEntry.detail,
        count: incomingEntry.count,
      });
    }
  }

  const merged: CliproxyUsageHistoryDetail[] = [];
  for (const { detail, count } of existingCounts.values()) {
    for (let index = 0; index < count; index++) {
      merged.push({ ...detail });
    }
  }

  return merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function pruneCliproxyUsageHistoryDetails(
  details: CliproxyUsageHistoryDetail[],
  oldestTimestamp: number
): CliproxyUsageHistoryDetail[] {
  return details.filter((detail) => {
    const timestamp = Date.parse(detail.timestamp);
    return Number.isFinite(timestamp) && timestamp >= oldestTimestamp;
  });
}

// ============================================================================
// GENERIC AGGREGATOR
// ============================================================================

/** Group flat details by a time key extractor, return sorted DailyUsage-like records */
function aggregateByKey<T>(
  flat: CliproxyUsageHistoryDetail[],
  keyFn: (timestamp: string) => string,
  buildRecord: (key: string, breakdowns: ModelBreakdown[], requestCount: number) => T,
  sortFn: (a: T, b: T) => number
): T[] {
  // bucket: timeKey -> modelName -> accumulator
  const buckets = new Map<string, Map<string, ModelAccumulator>>();
  const requestCounts = new Map<string, number>();

  for (const detail of flat) {
    const key = keyFn(detail.timestamp);
    if (!buckets.has(key)) buckets.set(key, new Map());
    requestCounts.set(key, (requestCounts.get(key) ?? 0) + detail.requestCount);
    const modelMap = buckets.get(key) as Map<string, ModelAccumulator>;
    if (!modelMap.has(detail.model)) {
      modelMap.set(detail.model, {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cost: 0,
      });
    }
    const acc = modelMap.get(detail.model) as ModelAccumulator;
    acc.inputTokens += detail.inputTokens;
    acc.outputTokens += detail.outputTokens;
    acc.cacheReadTokens += detail.cacheReadTokens;
    acc.cost += detail.cost;
  }

  const records: T[] = [];
  Array.from(buckets.entries()).forEach(([key, modelMap]) => {
    const breakdowns = Array.from(modelMap.entries()).map(([name, acc]) =>
      buildModelBreakdown(name, acc)
    );
    records.push(buildRecord(key, breakdowns, requestCounts.get(key) ?? 0));
  });

  return records.sort(sortFn);
}

/** Sum token field across all breakdowns */
function sumField(breakdowns: ModelBreakdown[], field: keyof ModelBreakdown): number {
  return breakdowns.reduce((acc, b) => acc + (b[field] as number), 0);
}

// ============================================================================
// TRANSFORMS
// ============================================================================

/** Transform CLIProxy usage response into DailyUsage array (sorted descending by date) */
export function transformCliproxyToDailyUsage(response: CliproxyUsageApiResponse): DailyUsage[] {
  const flat = extractCliproxyUsageHistoryDetails(response);
  return aggregateByKey(
    flat,
    (ts) => ts.slice(0, 10),
    (date, breakdowns) => {
      const totalCost = sumField(breakdowns, 'cost');
      return {
        date,
        source: 'cliproxy',
        inputTokens: sumField(breakdowns, 'inputTokens'),
        outputTokens: sumField(breakdowns, 'outputTokens'),
        cacheCreationTokens: 0,
        cacheReadTokens: sumField(breakdowns, 'cacheReadTokens'),
        cost: totalCost,
        totalCost,
        modelsUsed: breakdowns.map((b) => b.modelName),
        modelBreakdowns: breakdowns,
      };
    },
    (a, b) => b.date.localeCompare(a.date)
  );
}

/** Transform CLIProxy usage response into HourlyUsage array (sorted descending by hour) */
export function transformCliproxyToHourlyUsage(response: CliproxyUsageApiResponse): HourlyUsage[] {
  const flat = extractCliproxyUsageHistoryDetails(response);
  return aggregateByKey(
    flat,
    (ts) => {
      const date = ts.slice(0, 10);
      const hour = ts.slice(11, 13) || '00';
      return `${date} ${hour}:00`;
    },
    (hour, breakdowns, requestCount) => {
      const totalCost = sumField(breakdowns, 'cost');
      return {
        hour,
        source: 'cliproxy',
        inputTokens: sumField(breakdowns, 'inputTokens'),
        outputTokens: sumField(breakdowns, 'outputTokens'),
        cacheCreationTokens: 0,
        cacheReadTokens: sumField(breakdowns, 'cacheReadTokens'),
        cost: totalCost,
        totalCost,
        modelsUsed: breakdowns.map((b) => b.modelName),
        modelBreakdowns: breakdowns,
        requestCount,
      };
    },
    (a, b) => b.hour.localeCompare(a.hour)
  );
}

/** Transform CLIProxy usage response into MonthlyUsage array (sorted descending by month) */
export function transformCliproxyToMonthlyUsage(
  response: CliproxyUsageApiResponse
): MonthlyUsage[] {
  const flat = extractCliproxyUsageHistoryDetails(response);
  return aggregateByKey(
    flat,
    (ts) => ts.slice(0, 7),
    (month, breakdowns) => ({
      month,
      source: 'cliproxy',
      inputTokens: sumField(breakdowns, 'inputTokens'),
      outputTokens: sumField(breakdowns, 'outputTokens'),
      cacheCreationTokens: 0,
      cacheReadTokens: sumField(breakdowns, 'cacheReadTokens'),
      totalCost: sumField(breakdowns, 'cost'),
      modelsUsed: breakdowns.map((b) => b.modelName),
      modelBreakdowns: breakdowns,
    }),
    (a, b) => b.month.localeCompare(a.month)
  );
}

export function buildCliproxyUsageHistoryAggregates(details: CliproxyUsageHistoryDetail[]): {
  daily: DailyUsage[];
  hourly: HourlyUsage[];
  monthly: MonthlyUsage[];
} {
  return {
    daily: aggregateByKey(
      details,
      (timestamp) => timestamp.slice(0, 10),
      (date, breakdowns) => {
        const totalCost = sumField(breakdowns, 'cost');
        return {
          date,
          source: 'cliproxy',
          inputTokens: sumField(breakdowns, 'inputTokens'),
          outputTokens: sumField(breakdowns, 'outputTokens'),
          cacheCreationTokens: 0,
          cacheReadTokens: sumField(breakdowns, 'cacheReadTokens'),
          cost: totalCost,
          totalCost,
          modelsUsed: breakdowns.map((breakdown) => breakdown.modelName),
          modelBreakdowns: breakdowns,
        };
      },
      (a, b) => b.date.localeCompare(a.date)
    ),
    hourly: aggregateByKey(
      details,
      (timestamp) => {
        const date = timestamp.slice(0, 10);
        const hour = timestamp.slice(11, 13) || '00';
        return `${date} ${hour}:00`;
      },
      (hour, breakdowns, requestCount) => {
        const totalCost = sumField(breakdowns, 'cost');
        return {
          hour,
          source: 'cliproxy',
          inputTokens: sumField(breakdowns, 'inputTokens'),
          outputTokens: sumField(breakdowns, 'outputTokens'),
          cacheCreationTokens: 0,
          cacheReadTokens: sumField(breakdowns, 'cacheReadTokens'),
          cost: totalCost,
          totalCost,
          modelsUsed: breakdowns.map((breakdown) => breakdown.modelName),
          modelBreakdowns: breakdowns,
          requestCount,
        };
      },
      (a, b) => b.hour.localeCompare(a.hour)
    ),
    monthly: aggregateByKey(
      details,
      (timestamp) => timestamp.slice(0, 7),
      (month, breakdowns) => ({
        month,
        source: 'cliproxy',
        inputTokens: sumField(breakdowns, 'inputTokens'),
        outputTokens: sumField(breakdowns, 'outputTokens'),
        cacheCreationTokens: 0,
        cacheReadTokens: sumField(breakdowns, 'cacheReadTokens'),
        totalCost: sumField(breakdowns, 'cost'),
        modelsUsed: breakdowns.map((breakdown) => breakdown.modelName),
        modelBreakdowns: breakdowns,
      }),
      (a, b) => b.month.localeCompare(a.month)
    ),
  };
}
