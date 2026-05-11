import * as fs from 'fs';
import * as path from 'path';
import { OAuthTraceEvent, OAuthTraceSink } from './trace-events';

/**
 * Append-mode JSONL file sink. Off by default; enabled when callers pass an instance.
 *
 * - File path: `${dir}/oauth-YYYYMMDD.log` (date from `now()` per write call).
 * - Permissions: dir 0o700, file 0o600 (user-only). World-readable would leak machine info.
 * - Failure-tolerant: if write fails (disk full, perm denied), logs once to stderr and
 *   keeps dropping events silently — sink must never throw out of `write()`.
 */
export interface FileSinkOptions {
  dir: string;
  /** Test seam — defaults to `() => new Date()`. */
  now?: () => Date;
  /** Test seam — error notifier (defaults to one-shot stderr write). */
  onError?: (msg: string) => void;
}

export function createFileSink(options: FileSinkOptions): OAuthTraceSink {
  const now = options.now ?? (() => new Date());
  let warned = false;
  const onError =
    options.onError ??
    ((msg: string) => {
      if (!warned) {
        warned = true;
        process.stderr.write(`[oauth-trace] file sink disabled: ${msg}\n`);
      }
    });

  let cachedDate: string | null = null;

  function ensureDir(): void {
    fs.mkdirSync(options.dir, { recursive: true, mode: 0o700 });
  }

  function dateStr(d: Date): string {
    const yyyy = d.getFullYear().toString().padStart(4, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  }

  function pathForToday(): string {
    const ds = dateStr(now());
    cachedDate = ds;
    return path.join(options.dir, `oauth-${ds}.log`);
  }

  function appendOne(event: OAuthTraceEvent): void {
    const file = pathForToday();
    const line = JSON.stringify(event) + '\n';
    let fd: number | null = null;
    try {
      ensureDir();
      fd = fs.openSync(file, 'a', 0o600);
      fs.writeSync(fd, line);
    } finally {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch {
          // ignore
        }
      }
    }
  }

  return {
    write(event) {
      try {
        appendOne(event);
      } catch (err) {
        onError((err as Error).message);
      }
    },
    async flush() {
      // appendSync paths are flushed per-write; no buffer to drain.
      void cachedDate;
    },
  };
}
