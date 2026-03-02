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

/** Flat entry pairing a model name with its request detail */
interface FlatDetail {
  model: string;
  detail: CliproxyRequestDetail;
}

/** Accumulator for token counts per model per time bucket */
interface ModelAccumulator {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

/** Build ModelBreakdown from accumulated token counts */
function buildModelBreakdown(modelName: string, acc: ModelAccumulator): ModelBreakdown {
  const { inputTokens, outputTokens, cacheReadTokens } = acc;
  const cost = calculateCost(
    { inputTokens, outputTokens, cacheCreationTokens: 0, cacheReadTokens },
    modelName
  );
  return { modelName, inputTokens, outputTokens, cacheCreationTokens: 0, cacheReadTokens, cost };
}

// ============================================================================
// FLATTEN
// ============================================================================

/**
 * Flatten the nested response.usage.apis[provider].models[model].details[]
 * structure into a flat array. Failed requests are skipped.
 */
export function flattenCliproxyDetails(response: CliproxyUsageApiResponse): FlatDetail[] {
  const apis = response?.usage?.apis;
  if (!apis) return [];

  const results: FlatDetail[] = [];
  for (const providerData of Object.values(apis)) {
    const models = providerData?.models;
    if (!models) continue;
    for (const [model, modelData] of Object.entries(models)) {
      const details = modelData?.details;
      if (!details) continue;
      for (const detail of details) {
        if (detail.failed) continue;
        results.push({ model, detail });
      }
    }
  }
  return results;
}

// ============================================================================
// GENERIC AGGREGATOR
// ============================================================================

/** Group flat details by a time key extractor, return sorted DailyUsage-like records */
function aggregateByKey<T>(
  flat: FlatDetail[],
  keyFn: (timestamp: string) => string,
  buildRecord: (key: string, breakdowns: ModelBreakdown[]) => T,
  sortFn: (a: T, b: T) => number
): T[] {
  // bucket: timeKey -> modelName -> accumulator
  const buckets = new Map<string, Map<string, ModelAccumulator>>();

  for (const { model, detail } of flat) {
    const key = keyFn(detail.timestamp);
    if (!buckets.has(key)) buckets.set(key, new Map());
    const modelMap = buckets.get(key) as Map<string, ModelAccumulator>;
    if (!modelMap.has(model)) {
      modelMap.set(model, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 });
    }
    const acc = modelMap.get(model) as ModelAccumulator;
    acc.inputTokens += detail.tokens?.input_tokens ?? 0;
    acc.outputTokens += detail.tokens?.output_tokens ?? 0;
    acc.cacheReadTokens += detail.tokens?.cached_tokens ?? 0;
  }

  const records: T[] = [];
  Array.from(buckets.entries()).forEach(([key, modelMap]) => {
    const breakdowns = Array.from(modelMap.entries()).map(([name, acc]) =>
      buildModelBreakdown(name, acc)
    );
    records.push(buildRecord(key, breakdowns));
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
  const flat = flattenCliproxyDetails(response);
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
  const flat = flattenCliproxyDetails(response);
  return aggregateByKey(
    flat,
    (ts) => {
      const date = ts.slice(0, 10);
      const hour = ts.slice(11, 13) || '00';
      return `${date} ${hour}:00`;
    },
    (hour, breakdowns) => {
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
      };
    },
    (a, b) => b.hour.localeCompare(a.hour)
  );
}

/** Transform CLIProxy usage response into MonthlyUsage array (sorted descending by month) */
export function transformCliproxyToMonthlyUsage(
  response: CliproxyUsageApiResponse
): MonthlyUsage[] {
  const flat = flattenCliproxyDetails(response);
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
