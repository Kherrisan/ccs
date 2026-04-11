import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ScrollText,
  TimerReset,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ErrorLogsMonitor } from '@/components/error-logs-monitor';
import { LogsConfigCard } from '@/components/logs/logs-config-card';
import { LogsDetailPanel } from '@/components/logs/logs-detail-panel';
import { LogsEntryList } from '@/components/logs/logs-entry-list';
import { LogsFilters } from '@/components/logs/logs-filters';
import { LogsPageSkeleton } from '@/components/logs/logs-page-skeleton';
import { getSourceLabelMap, useLogsWorkspace, useUpdateLogsConfig } from '@/hooks/use-logs';

const DESKTOP_LOGS_BREAKPOINT = 1200;
const LEFT_PANEL_WIDTH = 336;
const RIGHT_PANEL_WIDTH = 368;
const COLLAPSED_PANEL_WIDTH = 52;

function CollapsedPaneToggle({
  side,
  label,
  onExpand,
}: {
  side: 'left' | 'right';
  label: string;
  onExpand: () => void;
}) {
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-4 bg-muted/5',
        side === 'left' ? 'border-r border-border' : 'border-l border-border'
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={onExpand}
        aria-label={`Show ${label.toLowerCase()}`}
        className="h-9 w-9 rounded-xl border border-border/70 bg-background/85 shadow-sm"
      >
        {side === 'left' ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </Button>
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/45"
        style={{ writingMode: 'vertical-rl' }}
      >
        {label}
      </span>
    </div>
  );
}

export function LogsPage() {
  const workspace = useLogsWorkspace();
  const updateConfig = useUpdateLogsConfig();
  const sourceLabels = getSourceLabelMap(workspace.sourcesQuery.data ?? []);
  const [isDesktopLayout, setIsDesktopLayout] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= DESKTOP_LOGS_BREAKPOINT : false
  );
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(false);
  const [isDetailsCollapsed, setIsDetailsCollapsed] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(min-width: ${DESKTOP_LOGS_BREAKPOINT}px)`);
    const syncLayout = () => {
      setIsDesktopLayout(window.innerWidth >= DESKTOP_LOGS_BREAKPOINT);
    };

    syncLayout();
    mediaQuery.addEventListener('change', syncLayout);
    return () => mediaQuery.removeEventListener('change', syncLayout);
  }, []);

  if (workspace.isInitialLoading) {
    return <LogsPageSkeleton />;
  }

  const config = workspace.configQuery.data;
  if (!config) {
    return null;
  }

  return (
    <div className="relative flex h-full min-h-full flex-col overflow-hidden border-t border-border/40 bg-background font-sans text-foreground antialiased selection:bg-primary/30 selection:text-primary">
      <div className="pointer-events-none absolute inset-0 z-0 opacity-40 [background-image:radial-gradient(circle_at_1px_1px,rgba(38,38,36,0.08)_1px,transparent_0)] [background-size:14px_14px]" />

      <div className="relative z-10 flex shrink-0 items-center justify-between border-b border-border/80 bg-card/95 px-6 py-2 backdrop-blur-xl shadow-md transition-all xl:px-8">
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-4">
            <div className="group flex h-9 w-9 items-center justify-center rounded-xl border-2 border-primary/20 bg-primary/5 text-primary shadow-inner transition-all hover:scale-110 active:scale-90">
              <ScrollText className="h-4.5 w-4.5 transition-transform group-hover:rotate-6" />
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2.5">
                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-foreground shadow-lg shadow-primary/20">
                  Operational
                </span>
                <h1 className="text-[17px] font-semibold tracking-tight text-foreground">
                  Log Operations Center
                </h1>
              </div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/45">
                CCS.TOC.LOGS.STREAM.v3
              </p>
            </div>
          </div>

          <div className="hidden h-8 w-px bg-border/80 md:block" />

          <div className="hidden items-center gap-10 md:flex">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'h-2 w-2 rounded-full ring-4 transition-all duration-700',
                  config.redact
                    ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.6)] ring-emerald-500/30'
                    : 'bg-zinc-600 ring-transparent'
                )}
              />
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/90">
                  Redaction
                </span>
                <span className="text-[11px] font-medium text-foreground/50">
                  {config.redact ? 'Enforced' : 'Standby'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-border bg-muted shadow-inner">
                <TimerReset className="h-3.5 w-3.5 text-foreground" />
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/90">
                  Retention
                </span>
                <span className="text-[11px] font-medium text-foreground/50">
                  {config.retain_days}D / {config.rotate_mb}MB
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            className="group h-9 gap-3 rounded-xl border-2 border-border bg-muted px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground transition-all hover:bg-foreground hover:text-background active:scale-95 shadow-lg shadow-black/5"
            onClick={() =>
              void Promise.all([workspace.sourcesQuery.refetch(), workspace.entriesQuery.refetch()])
            }
          >
            <div className="relative">
              <RefreshCw
                className={cn(
                  'h-3.5 w-3.5 transition-transform duration-500',
                  (workspace.entriesQuery.isFetching || workspace.sourcesQuery.isFetching) &&
                    'animate-spin'
                )}
              />
              {!workspace.entriesQuery.isFetching && !workspace.sourcesQuery.isFetching && (
                <div className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full border border-muted bg-primary animate-pulse" />
              )}
            </div>
            {workspace.entriesQuery.isFetching || workspace.sourcesQuery.isFetching
              ? 'Syncing'
              : 'Refresh'}
          </Button>
          <div className="h-7 w-px bg-border/80" />
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-9 w-9 rounded-xl border-2 border-border bg-muted p-0 text-foreground transition-all hover:bg-foreground hover:text-background active:scale-95 shadow-lg shadow-black/5"
          >
            <Link to="/health">
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        <Tabs defaultValue="stream" className="flex flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-border/80 bg-card/80 px-6 py-2 backdrop-blur-xl shadow-inner xl:px-8">
            <TabsList className="h-10 w-auto gap-1.5 rounded-xl border border-border/60 bg-muted/40 p-1">
              <TabsTrigger
                value="stream"
                className="rounded-lg px-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/60 transition-all data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-md"
              >
                Telemetry Stream
              </TabsTrigger>
              <TabsTrigger
                value="errors"
                className="rounded-lg px-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/60 transition-all data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-md"
              >
                Legacy Errors
              </TabsTrigger>
            </TabsList>

            <div className="hidden items-center gap-3 lg:flex">
              <div className="flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 shadow-inner">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-tight text-foreground/80">
                  Connected
                </span>
              </div>
              <span className="pr-4 text-[11px] font-medium tabular-nums text-foreground/45">
                {workspace.entriesQuery.data?.length ?? 0} captured
              </span>
            </div>
          </div>

          <TabsContent
            value="stream"
            className="m-0 flex min-h-0 flex-1 overflow-y-auto lg:overflow-hidden focus-visible:outline-none"
          >
            {isDesktopLayout ? (
              <div className="flex min-h-0 flex-1 overflow-hidden">
                <div
                  data-logs-pane="filters"
                  style={{ width: isFiltersCollapsed ? COLLAPSED_PANEL_WIDTH : LEFT_PANEL_WIDTH }}
                  className="flex min-h-0 shrink-0 bg-muted/5"
                >
                  {isFiltersCollapsed ? (
                    <CollapsedPaneToggle
                      side="left"
                      label="Filters"
                      onExpand={() => setIsFiltersCollapsed(false)}
                    />
                  ) : (
                    <div className="flex h-full min-h-0 w-full flex-col border-r border-border p-5 2xl:p-6">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/80">
                            Filters
                          </p>
                          <p className="text-[11px] text-muted-foreground/70">
                            Search, source, and retention controls
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setIsFiltersCollapsed(true)}
                          aria-label="Hide filters"
                          className="h-9 w-9 rounded-xl border border-border/70 bg-background/85 shadow-sm"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                      </div>

                      <ScrollArea className="min-h-0 flex-1" data-logs-scroll-region="filters">
                        <div className="space-y-5 pr-4">
                          <LogsFilters
                            sources={workspace.sourcesQuery.data ?? []}
                            selectedSource={workspace.selectedSource}
                            onSourceChange={workspace.setSelectedSource}
                            selectedLevel={workspace.selectedLevel}
                            onLevelChange={workspace.setSelectedLevel}
                            search={workspace.search}
                            onSearchChange={workspace.setSearch}
                            limit={workspace.limit}
                            onLimitChange={workspace.setLimit}
                            onRefresh={() =>
                              void Promise.all([
                                workspace.sourcesQuery.refetch(),
                                workspace.entriesQuery.refetch(),
                              ])
                            }
                            isRefreshing={
                              workspace.entriesQuery.isFetching || workspace.sourcesQuery.isFetching
                            }
                          />
                          <div className="border-t border-border/20 pt-5">
                            <LogsConfigCard
                              config={config}
                              onSave={(payload) => updateConfig.mutate(payload)}
                              isPending={updateConfig.isPending}
                            />
                          </div>
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </div>

                <div
                  data-logs-pane="entries"
                  className="flex min-h-0 min-w-0 flex-1 overflow-hidden border-l border-r border-border bg-background/95"
                >
                  <LogsEntryList
                    entries={workspace.entriesQuery.data ?? []}
                    selectedEntryId={workspace.selectedEntryId}
                    onSelect={workspace.setSelectedEntryId}
                    sourceLabels={sourceLabels}
                    isLoading={workspace.entriesQuery.isLoading}
                    isFetching={workspace.entriesQuery.isFetching}
                  />
                </div>

                <div
                  data-logs-pane="details"
                  style={{ width: isDetailsCollapsed ? COLLAPSED_PANEL_WIDTH : RIGHT_PANEL_WIDTH }}
                  className="flex min-h-0 shrink-0 bg-muted/5 shadow-inner"
                >
                  {isDetailsCollapsed ? (
                    <CollapsedPaneToggle
                      side="right"
                      label="Details"
                      onExpand={() => setIsDetailsCollapsed(false)}
                    />
                  ) : (
                    <div className="flex h-full min-h-0 w-full flex-col">
                      <div className="flex items-center justify-between border-b border-border/50 bg-background/60 px-3 py-2">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/80">
                            Details
                          </p>
                          <p className="text-[11px] text-muted-foreground/70">
                            Selected entry context and raw payload
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setIsDetailsCollapsed(true)}
                          aria-label="Hide details"
                          className="h-9 w-9 rounded-xl border border-border/70 bg-background/85 shadow-sm"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <LogsDetailPanel
                          entry={workspace.selectedEntry}
                          sourceLabel={
                            workspace.selectedEntry
                              ? sourceLabels[workspace.selectedEntry.source]
                              : undefined
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="border-b border-border bg-muted/5 p-5">
                  <div className="flex flex-col gap-6">
                    <LogsFilters
                      sources={workspace.sourcesQuery.data ?? []}
                      selectedSource={workspace.selectedSource}
                      onSourceChange={workspace.setSelectedSource}
                      selectedLevel={workspace.selectedLevel}
                      onLevelChange={workspace.setSelectedLevel}
                      search={workspace.search}
                      onSearchChange={workspace.setSearch}
                      limit={workspace.limit}
                      onLimitChange={workspace.setLimit}
                      onRefresh={() =>
                        void Promise.all([
                          workspace.sourcesQuery.refetch(),
                          workspace.entriesQuery.refetch(),
                        ])
                      }
                      isRefreshing={
                        workspace.entriesQuery.isFetching || workspace.sourcesQuery.isFetching
                      }
                    />
                    <LogsConfigCard
                      config={config}
                      onSave={(payload) => updateConfig.mutate(payload)}
                      isPending={updateConfig.isPending}
                    />
                  </div>
                </div>

                <div className="flex min-h-[32rem] flex-col overflow-hidden border-b border-border bg-background/95">
                  <LogsEntryList
                    entries={workspace.entriesQuery.data ?? []}
                    selectedEntryId={workspace.selectedEntryId}
                    onSelect={workspace.setSelectedEntryId}
                    sourceLabels={sourceLabels}
                    isLoading={workspace.entriesQuery.isLoading}
                    isFetching={workspace.entriesQuery.isFetching}
                  />
                </div>

                <div className="flex min-h-[30rem] flex-col overflow-hidden bg-muted/5 shadow-inner">
                  <LogsDetailPanel
                    entry={workspace.selectedEntry}
                    sourceLabel={
                      workspace.selectedEntry
                        ? sourceLabels[workspace.selectedEntry.source]
                        : undefined
                    }
                  />
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="errors"
            className="m-0 flex-1 overflow-y-auto bg-background/20 p-6 focus-visible:outline-none xl:p-8"
          >
            <div className="mx-auto max-w-5xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="relative overflow-hidden rounded-[2.5rem] border-2 border-border bg-card/40 p-1.5 shadow-2xl shadow-black/10">
                <div className="absolute inset-0 opacity-[0.02] pointer-events-none [background-image:radial-gradient(circle_at_center,var(--primary)_1px,transparent_0)] [background-size:24px_24px]" />

                <Card className="rounded-[calc(2.5rem-0.375rem)] border-none bg-background/60 shadow-none overflow-hidden backdrop-blur-md">
                  <CardContent className="flex flex-col gap-6 p-10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-primary/20 bg-primary/10 text-primary shadow-inner">
                          <ScrollText className="h-5 w-5" />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">
                            Legacy Diagnostic Node
                          </p>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">
                            CCS-MATRIX-FAILURE-MONITOR
                          </p>
                        </div>
                      </div>
                      <div className="rounded-full border border-border bg-background/50 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-foreground/40 shadow-inner">
                        Mode: Historical
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h2 className="text-3xl font-black uppercase tracking-tighter text-foreground">
                        CLIProxy Failure Analysis
                      </h2>
                      <p className="max-w-3xl text-[15px] font-medium leading-relaxed text-muted-foreground/60">
                        Maintain oversight of legacy request failures while the unified stream
                        consolidates system-wide telemetry. This view provides direct access to the
                        historical failure matrix for deep-field debugging.
                      </p>
                    </div>

                    <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent opacity-40" />
                  </CardContent>
                </Card>
              </div>

              <div className="rounded-[2.5rem] border-2 border-border bg-muted/5 p-8 shadow-inner backdrop-blur-sm">
                <div className="mb-6 flex items-center gap-3">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-foreground/40">
                    Realtime Monitoring Deck
                  </span>
                </div>
                <ErrorLogsMonitor />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
