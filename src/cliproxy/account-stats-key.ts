export function buildQualifiedAccountStatsKey(provider: string, source: string): string {
  return `${provider.trim().toLowerCase()}:${source.trim()}`;
}
