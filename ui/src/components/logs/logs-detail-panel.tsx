import {
  FileJson,
  Info,
  ShieldCheck,
  Terminal,
  Fingerprint,
  Database,
  Cpu,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { LogsEntry } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { LogLevelBadge } from './log-level-badge';
import { formatJson } from './utils';
import { useTranslation } from 'react-i18next';

function MetaRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
}) {
  return (
    <div className="group relative flex flex-col gap-1.5 rounded-xl border border-border/40 bg-background/40 p-3 transition-all hover:bg-background/80 hover:shadow-lg hover:shadow-black/5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {Icon && (
            <Icon className="h-3 w-3 text-primary/40 group-hover:text-primary transition-colors" />
          )}
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 transition-colors group-hover:text-primary/60">
            {label}
          </p>
        </div>
        <div className="h-1 w-1 rounded-full bg-border/40 group-hover:bg-primary/40 transition-colors" />
      </div>
      <p className="truncate font-mono text-[13px] font-medium tracking-tight text-foreground/85 transition-colors group-hover:text-foreground">
        {value}
      </p>
    </div>
  );
}

export function LogsDetailPanel({
  entry,
  sourceLabel,
}: {
  entry: LogsEntry | null;
  sourceLabel?: string;
}) {
  const { t } = useTranslation();

  if (!entry) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center animate-in fade-in duration-1000">
        <div className="relative mb-8">
          <div className="absolute inset-0 animate-ping rounded-full bg-primary/5 p-12" />
          <div className="relative rounded-full border-2 border-dashed border-border/40 p-10 bg-muted/5">
            <Terminal className="h-10 w-10 text-muted-foreground/20" />
          </div>
        </div>
        <div className="max-w-xs space-y-3">
          <h3 className="text-[15px] font-semibold uppercase tracking-[0.14em] text-foreground/65">
            {/* TODO i18n: missing key for "Inspector Standby" */}
            Inspector Standby
          </h3>
          <p className="text-[13px] leading-relaxed text-muted-foreground/55 font-medium">
            Select a telemetry node from the active data queue to perform deep analysis of its
            operational context.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-card/30 backdrop-blur-sm animate-in fade-in slide-in-from-right-4 duration-500">
      {/* Tactical Inspector Header */}
      <div className="relative shrink-0 border-b border-border bg-card/60 p-6 shadow-sm overflow-hidden">
        {/* Pattern Overlay */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none [background-image:radial-gradient(circle_at_center,var(--primary)_1px,transparent_0)] [background-size:16px_16px]" />

        <div className="relative space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <LogLevelBadge level={entry.level} className="h-5 px-3 shadow-lg shadow-black/5" />
              <div className="h-4 w-px bg-border/60" />
              <div className="flex items-center gap-2 rounded-full border border-border bg-background/50 px-3 py-1 shadow-inner">
                <Database className="h-3 w-3 text-primary/60" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/75">
                  {sourceLabel ?? entry.source}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="h-3 w-3 animate-pulse text-emerald-500" />
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/45">
                {new Date(entry.timestamp).toLocaleTimeString(undefined, {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-1 w-4 rounded-full bg-primary/40" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary/65">
                Event
              </p>
            </div>
            <h2 className="text-[24px] font-semibold tracking-tight text-foreground leading-tight break-words">
              {entry.event}
            </h2>
            <div className="rounded-xl border-l-4 border-primary/20 bg-muted/20 p-4 shadow-inner">
              <p className="text-[14px] font-medium leading-relaxed text-foreground/85 selection:bg-primary/20">
                {entry.message}
              </p>
            </div>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6">
          <Tabs defaultValue="details" className="space-y-8">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl border border-border/60 bg-muted/40 p-1">
              <TabsTrigger
                value="details"
                className="min-w-0 gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] transition-all data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
              >
                <Info className="h-3.5 w-3.5" />
                {t('logsDetailPanel.details')}
              </TabsTrigger>
              <TabsTrigger
                value="raw"
                className="min-w-0 gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] transition-all data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
              >
                <FileJson className="h-3.5 w-3.5" />
                {/* TODO i18n: missing key for "Raw Context" */}
                Raw Context
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="details"
              className="mt-0 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <MetaRow
                  label="Entry Signature"
                  value={entry.id.slice(0, 16) + '...'}
                  icon={Fingerprint}
                />
                <MetaRow label="Telemetry Origin" value={entry.source} icon={Database} />
                <MetaRow label="Process ID" value={entry.processId ?? 'NA'} icon={Cpu} />
                <MetaRow
                  label="Operational Run"
                  value={entry.runId?.slice(0, 8) ?? 'NA'}
                  icon={ShieldCheck}
                />
              </div>

              <div className="relative overflow-hidden rounded-[2rem] border border-border bg-muted/10 p-1 shadow-inner group">
                {/* Background Scanline */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.03] to-transparent h-[200%] -top-full animate-[scan_8s_linear_infinite] pointer-events-none" />

                <div className="rounded-[calc(2rem-4px)] border border-dashed border-border/40 bg-background/50 p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/5 border border-primary/20 text-primary shadow-inner">
                      <Terminal className="h-4 w-4" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                        Automated Summary
                      </p>
                      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/55">
                        Quick interpretation
                      </p>
                    </div>
                  </div>
                  <p className="text-[13px] leading-relaxed text-muted-foreground/80 font-medium">
                    This telemetry node was captured from{' '}
                    <span className="rounded bg-muted/40 px-1.5 py-0.5 font-semibold text-foreground">
                      {sourceLabel ?? entry.source}
                    </span>
                    operating at the{' '}
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]',
                        entry.level === 'error'
                          ? 'bg-red-500/10 text-red-500'
                          : entry.level === 'warn'
                            ? 'bg-amber-500/10 text-amber-500'
                            : entry.level === 'info'
                              ? 'bg-sky-500/10 text-sky-500'
                              : 'bg-zinc-500/10 text-zinc-500'
                      )}
                    >
                      {entry.level}
                    </span>{' '}
                    threshold. The operational payload indicates an event state of{' '}
                    <span className="font-semibold text-foreground">{entry.event}</span>.
                  </p>
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="raw"
              className="mt-0 animate-in fade-in slide-in-from-bottom-2 duration-500"
            >
              <div className="group relative rounded-2xl border-2 border-border bg-zinc-950 p-1 shadow-2xl transition-all hover:border-primary/20">
                {/* Copy HUD */}
                <div className="absolute right-4 top-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-medium uppercase tracking-[0.12em] text-white/45 backdrop-blur-md">
                    JSON.RAW.MODE
                  </div>
                </div>

                <ScrollArea className="h-[30rem] w-full rounded-xl p-6">
                  <pre className="font-mono text-[12px] leading-relaxed tracking-tight text-zinc-400 selection:bg-primary/40 selection:text-primary-foreground">
                    {formatJson({
                      id: entry.id,
                      timestamp: entry.timestamp,
                      level: entry.level,
                      source: entry.source,
                      event: entry.event,
                      message: entry.message,
                      processId: entry.processId,
                      runId: entry.runId,
                      context: entry.context ?? {},
                    })}
                  </pre>
                </ScrollArea>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>

      <div className="flex shrink-0 items-center justify-between border-t border-border bg-muted/5 px-6 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-foreground/35">
              Node Verified
            </span>
          </div>
          <div className="h-3 w-px bg-border/40" />
          <span className="text-[10px] font-medium tabular-nums uppercase tracking-[0.12em] text-foreground/35">
            {entry.id.slice(0, 8)}
          </span>
        </div>
        <div className="rounded-full bg-primary/5 px-2 py-0.5 border border-primary/10">
          <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-primary/65">
            CCS-TEC-v3
          </span>
        </div>
      </div>
    </div>
  );
}
