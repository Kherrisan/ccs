import { Activity, ArrowRight, Inbox, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { LogsEntry } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { LogLevelBadge } from './log-level-badge';
import { useTranslation } from 'react-i18next';

export function LogsEntryList({
  entries,
  selectedEntryId,
  onSelect,
  sourceLabels,
  isLoading,
  isFetching,
}: {
  entries: LogsEntry[];
  selectedEntryId: string | null;
  onSelect: (entryId: string) => void;
  sourceLabels: Record<string, string>;
  isLoading: boolean;
  isFetching: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background/50 backdrop-blur-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card/40 px-6 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-primary shadow-[0_0_12px_rgba(var(--primary),0.6)]" />
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-foreground">
              Live Entry Stream
            </h2>
          </div>
          <div className="h-4 w-px bg-border/60" />
          <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5">
            <Activity className="h-3 w-3 text-emerald-500" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-600">
              Live telemetry
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isFetching && (
            <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                Syncing
              </span>
            </div>
          )}
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/35">
            NODE.01
          </span>
        </div>
      </div>

      <div className="flex items-center gap-0 border-b border-border bg-muted/30 px-0 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/45">
        <div className="w-[6.5rem] shrink-0 px-6">{t('logsConfig.time')}</div>
        <div className="w-14 shrink-0 border-l border-border/10 px-2 text-center">
          {t('logsConfig.level')}
        </div>
        <div className="w-[15rem] shrink-0 border-l border-border/10 px-4">
          {t('logsConfig.source')}
        </div>
        <div className="flex-1 border-l border-border/10 px-4">{t('logsConfig.message')}</div>
        <div className="w-[5.5rem] shrink-0 border-l border-border/10 px-2 text-center">
          {t('logsConfig.proc')}
        </div>
        <div className="w-[5.5rem] shrink-0 border-l border-border/10 px-3 text-center">
          {t('logsConfig.run')}
        </div>
        <div className="w-11 shrink-0 border-l border-border/10 px-2 text-center">
          {t('logsConfig.open')}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {isLoading ? (
          <div className="space-y-1 p-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((item) => (
              <div
                key={item}
                className="h-10 w-full animate-pulse rounded-lg border border-border/5 bg-muted/20"
              />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex h-full animate-in fade-in duration-1000 flex-col items-center justify-center gap-6 px-8 text-center">
            <div className="relative">
              <div className="absolute inset-0 animate-ping rounded-full bg-muted/5 p-12" />
              <div className="relative rounded-full border border-dashed border-border/40 bg-muted/5 p-10">
                <Inbox className="h-10 w-10 text-muted-foreground/20" />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
                No matching entries
              </p>
              <p className="max-w-[18rem] text-[12px] font-medium leading-relaxed text-muted-foreground/60">
                Your current source, level, or search filters are hiding the stream. Adjust them to
                bring entries back into view.
              </p>
            </div>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="flex flex-col">
              {entries.map((entry) => {
                const isSelected = entry.id === selectedEntryId;

                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => onSelect(entry.id)}
                    className={cn(
                      'group relative flex w-full items-center border-b border-border/5 px-0 py-2.5 text-left transition-all duration-150',
                      isSelected
                        ? 'z-10 bg-primary/[0.08] shadow-[inset_4px_0_0_rgba(var(--primary),1)]'
                        : 'bg-transparent hover:bg-muted/30'
                    )}
                  >
                    <div className="absolute inset-y-0 left-0 w-1 origin-center scale-y-0 bg-primary transition-transform duration-300 group-hover:scale-y-100" />

                    <div className="flex w-full items-center gap-0">
                      <div className="flex w-[6.5rem] shrink-0 items-center">
                        <p
                          className={cn(
                            'px-6 font-mono text-[11px] font-semibold tabular-nums transition-colors',
                            isSelected
                              ? 'text-primary'
                              : 'text-foreground/60 group-hover:text-foreground'
                          )}
                        >
                          {new Date(entry.timestamp).toLocaleTimeString(undefined, {
                            hour12: false,
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </p>
                      </div>

                      <div className="flex min-w-0 flex-1 items-center gap-0">
                        <div className="flex w-14 shrink-0 items-center justify-center opacity-80 transition-opacity group-hover:opacity-100">
                          <LogLevelBadge
                            level={entry.level}
                            className="origin-center scale-[0.85]"
                          />
                        </div>

                        <div className="flex w-[15rem] shrink-0 flex-col gap-0.5 overflow-hidden px-4">
                          <span
                            className={cn(
                              'truncate text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors',
                              isSelected
                                ? 'text-foreground'
                                : 'text-foreground/50 group-hover:text-foreground/80'
                            )}
                          >
                            {sourceLabels[entry.source] ?? entry.source}
                          </span>
                          <span className="truncate text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/55">
                            {entry.event}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1 px-4">
                          <p
                            className={cn(
                              'truncate text-[13px] font-medium leading-5 transition-colors',
                              isSelected
                                ? 'text-foreground'
                                : 'text-foreground/70 group-hover:text-foreground'
                            )}
                          >
                            {entry.message}
                          </p>
                        </div>

                        <div className="flex w-[5.5rem] shrink-0 items-center justify-center px-2 font-mono text-[10px] font-semibold tabular-nums tracking-[0.12em] text-foreground/30 transition-colors group-hover:text-primary/45">
                          {entry.processId ?? '????'}
                        </div>
                        <div className="flex w-[5.5rem] shrink-0 items-center justify-center px-3 font-mono text-[10px] font-semibold tabular-nums tracking-[0.12em] text-foreground/30 transition-colors group-hover:text-primary/45">
                          {entry.runId?.slice(0, 4).toUpperCase() ?? 'NONE'}
                        </div>
                        <div className="flex w-11 shrink-0 items-center justify-center px-2">
                          <div
                            className={cn(
                              'flex h-7 w-7 items-center justify-center rounded-full border transition-all',
                              isSelected
                                ? 'animate-in zoom-in duration-300 border-primary/20 bg-primary/10 text-primary'
                                : 'border-transparent text-foreground/20 group-hover:border-border/40 group-hover:bg-background/80 group-hover:text-foreground/55'
                            )}
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-border bg-muted/5 px-6 py-2">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-foreground/35">
            Node: CCS-CORE
          </span>
          <div className="h-1 w-1 rounded-full bg-border/40" />
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-foreground/35">
            Status: Operational
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-foreground/35">
            Entries: {entries.length}
          </span>
        </div>
      </div>
    </div>
  );
}
