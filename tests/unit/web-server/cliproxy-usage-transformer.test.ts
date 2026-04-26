import { describe, expect, it } from 'bun:test';
import type { CliproxyUsageApiResponse } from '../../../src/cliproxy/stats-fetcher';
import {
  flattenCliproxyDetails,
  transformCliproxyToDailyUsage,
  transformCliproxyToHourlyUsage,
  transformCliproxyToMonthlyUsage,
} from '../../../src/web-server/usage/cliproxy-usage-transformer';

const sampleResponse: CliproxyUsageApiResponse = {
  usage: {
    apis: {
      gemini: {
        models: {
          'gemini-2.5-pro': {
            details: [
              {
                timestamp: '2026-03-01T10:15:00.000Z',
                source: 'account-a',
                auth_index: 0,
                tokens: {
                  input_tokens: 100,
                  output_tokens: 50,
                  reasoning_tokens: 0,
                  cached_tokens: 20,
                  total_tokens: 170,
                },
                failed: false,
              },
              {
                timestamp: '2026-03-01T11:30:00.000Z',
                source: 'account-a',
                auth_index: 0,
                tokens: {
                  input_tokens: 40,
                  output_tokens: 10,
                  reasoning_tokens: 0,
                  cached_tokens: 5,
                  total_tokens: 55,
                },
                failed: true,
              },
              {
                timestamp: '2026-03-01T12:15:00.000Z',
                source: 'account-a',
                auth_index: 0,
                tokens: {
                  input_tokens: 0,
                  output_tokens: 0,
                  reasoning_tokens: 0,
                  cached_tokens: 0,
                  total_tokens: 0,
                },
                failed: true,
              },
              {
                timestamp: '2026-03-01T10:45:00.000Z',
                source: 'account-a',
                auth_index: 0,
                tokens: {
                  input_tokens: 30,
                  output_tokens: 20,
                  reasoning_tokens: 0,
                  cached_tokens: 10,
                  total_tokens: 60,
                },
                failed: false,
              },
            ],
          },
        },
      },
      codex: {
        models: {
          'gpt-4.1': {
            details: [
              {
                timestamp: '2026-03-02T01:00:00.000Z',
                source: 'account-b',
                auth_index: 1,
                tokens: {
                  input_tokens: 70,
                  output_tokens: 30,
                  reasoning_tokens: 0,
                  cached_tokens: 0,
                  total_tokens: 100,
                },
                failed: false,
              },
            ],
          },
        },
      },
    },
  },
};

describe('cliproxy usage transformer', () => {
  it('retains failed requests when they carry usage and skips zero-usage failures', () => {
    const flat = flattenCliproxyDetails(sampleResponse);
    expect(flat).toHaveLength(4);
    expect(
      flat.some(
        (entry) =>
          entry.detail.failed === true &&
          entry.detail.tokens.input_tokens === 40 &&
          entry.detail.tokens.output_tokens === 10
      )
    ).toBe(true);
    expect(
      flat.some(
        (entry) =>
          entry.detail.failed === true &&
          entry.detail.tokens.input_tokens === 0 &&
          entry.detail.tokens.output_tokens === 0
      )
    ).toBe(false);
  });

  it('transforms daily usage with aggregated model totals', () => {
    const daily = transformCliproxyToDailyUsage(sampleResponse);

    expect(daily).toHaveLength(2);
    expect(daily[0].date).toBe('2026-03-02');
    expect(daily[0].source).toBe('cliproxy');
    expect(daily[1].date).toBe('2026-03-01');

    const marchFirst = daily.find((d) => d.date === '2026-03-01');
    expect(marchFirst?.inputTokens).toBe(170);
    expect(marchFirst?.outputTokens).toBe(80);
    expect(marchFirst?.cacheReadTokens).toBe(35);
    expect(marchFirst?.modelsUsed).toContain('gemini-2.5-pro');
  });

  it('transforms hourly usage with hour buckets', () => {
    const hourly = transformCliproxyToHourlyUsage(sampleResponse);

    expect(hourly).toHaveLength(3);
    expect(hourly[0].hour).toBe('2026-03-02 01:00');

    const tenAm = hourly.find((h) => h.hour === '2026-03-01 10:00');
    expect(tenAm?.inputTokens).toBe(130);
    expect(tenAm?.outputTokens).toBe(70);

    const elevenAm = hourly.find((h) => h.hour === '2026-03-01 11:00');
    expect(elevenAm?.inputTokens).toBe(40);
    expect(elevenAm?.outputTokens).toBe(10);
  });

  it('transforms monthly usage with cliproxy source', () => {
    const monthly = transformCliproxyToMonthlyUsage(sampleResponse);

    expect(monthly).toHaveLength(1);
    expect(monthly[0].month).toBe('2026-03');
    expect(monthly[0].source).toBe('cliproxy');
    expect(monthly[0].inputTokens).toBe(240);
    expect(monthly[0].outputTokens).toBe(110);
    expect(monthly[0].cacheReadTokens).toBe(35);
  });
});
