import { OAuthTraceSink } from './trace-events';

/**
 * Verbose stdout sink. Writes one ASCII line per event when verbose=true.
 * Format: `[oauth-trace] +{elapsedMs}ms {phase} {key=val ...}`
 * No emojis (CCS terminal rule). Goes to stderr to avoid mingling with normal stdout.
 */
export function createVerboseStdoutSink(opts: {
  enabled: boolean;
  out?: (line: string) => void;
}): OAuthTraceSink {
  const out = opts.out ?? ((line: string) => process.stderr.write(line + '\n'));
  return {
    write(event) {
      if (!opts.enabled) return;
      const parts: string[] = [];
      parts.push(`[oauth-trace] +${event.elapsedMs}ms ${event.phase}`);
      if (event.data) {
        for (const [k, v] of Object.entries(event.data)) {
          if (v === undefined) continue;
          parts.push(`${k}=${formatValue(v)}`);
        }
      }
      if (event.error) {
        parts.push(`error_code=${event.error.code ?? 'unknown'}`);
        parts.push(`error_msg="${event.error.message.replace(/"/g, "'")}"`);
      }
      out(parts.join(' '));
    },
  };
}

function formatValue(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return v.includes(' ') ? `"${v.replace(/"/g, "'")}"` : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return '[unserializable]';
  }
}
