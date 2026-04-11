import type { LogsLevel } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { getLevelLabel } from './utils';

const LEVEL_STYLES: Record<LogsLevel, string> = {
  error: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  debug: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
};

export function LogLevelBadge({ level, className }: { level: LogsLevel; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em]',
        LEVEL_STYLES[level],
        className
      )}
    >
      {getLevelLabel(level)}
    </span>
  );
}
