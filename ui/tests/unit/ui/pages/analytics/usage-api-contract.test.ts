import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usageApi } from '@/hooks/use-usage';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('analytics usage API contract', () => {
  beforeEach(() => {
    global.fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(jsonResponse({ data: {} }))) as typeof fetch;
  });

  it('omits unsupported profile and months query params while keeping supported filters', async () => {
    const startDate = new Date(2026, 3, 1);
    const endDate = new Date(2026, 3, 30);

    await usageApi.summary({ startDate, endDate, profile: 'work' });
    await usageApi.trends({ startDate, endDate, profile: 'work' });
    await usageApi.models({ startDate, endDate, profile: 'work' });
    await usageApi.sessions({ startDate, endDate, profile: 'work', limit: 50, offset: 10 });
    await usageApi.insights({ startDate, endDate, profile: 'work' });
    await usageApi.monthly({ startDate, endDate, profile: 'work' });

    const urls = vi.mocked(global.fetch).mock.calls.map(([url]) => String(url));

    expect(urls).toContain('/api/usage/summary?since=20260401&until=20260430');
    expect(urls).toContain('/api/usage/daily?since=20260401&until=20260430');
    expect(urls).toContain('/api/usage/models?since=20260401&until=20260430');
    expect(urls).toContain('/api/usage/sessions?since=20260401&until=20260430&limit=50&offset=10');
    expect(urls).toContain('/api/usage/insights?since=20260401&until=20260430');
    expect(urls).toContain('/api/usage/monthly?since=20260401&until=20260430');
    expect(urls.every((url) => !url.includes('profile='))).toBe(true);
    expect(urls.every((url) => !url.includes('months='))).toBe(true);
  });
});
