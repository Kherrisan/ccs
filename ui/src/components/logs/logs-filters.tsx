import { Search, RefreshCw, Filter, Shield, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { LogsSource } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { LogsLevelFilter, LogsSourceFilter } from '@/hooks/use-logs';
import { getLogLevelOptions } from '@/hooks/use-logs';

export function LogsFilters({
  sources,
  selectedSource,
  onSourceChange,
  selectedLevel,
  onLevelChange,
  search,
  onSearchChange,
  limit,
  onLimitChange,
  onRefresh,
  isRefreshing,
}: {
  sources: LogsSource[];
  selectedSource: LogsSourceFilter;
  onSourceChange: (value: LogsSourceFilter) => void;
  selectedLevel: LogsLevelFilter;
  onLevelChange: (value: LogsLevelFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  limit: number;
  onLimitChange: (value: number) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const levels = getLogLevelOptions();
  const limits = [50, 100, 150, 250];

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-left-2 duration-700">
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
            <Label
              htmlFor="logs-search"
              className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/80"
            >
              Payload Search
            </Label>
          </div>
          <Zap className="h-3 w-3 text-primary/20" />
        </div>
        <div className="group relative">
          <div className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center transition-all group-focus-within:translate-x-1">
            <Search className="h-3.5 w-3.5 text-foreground/20 group-focus-within:text-primary transition-colors" />
          </div>
          <Input
            id="logs-search"
            aria-label="Search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Scan for patterns..."
            className="h-11 rounded-xl border-2 border-border/40 bg-background/50 pl-10 text-[13px] font-medium text-foreground placeholder:text-foreground/35 focus-visible:border-primary/40 focus-visible:ring-0 transition-all shadow-inner"
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <Filter className="h-3 w-3 text-primary/40" />
          <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/80">
            Source Matrix
          </Label>
        </div>
        <div className="flex flex-col gap-1" aria-label="Source filter">
          <button
            type="button"
            onClick={() => onSourceChange('all')}
            className={cn(
              'group relative flex items-center justify-between rounded-lg border px-3 py-2 transition-all active:scale-[0.98]',
              selectedSource === 'all'
                ? 'border-primary/50 bg-primary/10 text-primary shadow-[0_0_15px_rgba(var(--primary),0.1)]'
                : 'border-border/40 bg-muted/20 text-foreground/40 hover:border-border hover:bg-muted/40 hover:text-foreground/80'
            )}
          >
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">
              Global Stream
            </span>
            {selectedSource === 'all' && (
              <div className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]" />
            )}
          </button>

          <div className="grid grid-cols-2 gap-1 mt-1">
            {sources.map((source) => (
              <button
                key={source.source}
                type="button"
                onClick={() => onSourceChange(source.source)}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] transition-all active:scale-[0.97]',
                  selectedSource === source.source
                    ? 'border-primary/50 bg-primary/10 text-primary shadow-sm'
                    : 'border-border/40 bg-muted/20 text-foreground/40 hover:border-border hover:bg-muted/40 hover:text-foreground/80'
                )}
              >
                {source.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Threshold Control */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <Shield className="h-3 w-3 text-primary/40" />
          <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/80">
            Sensitivity
          </Label>
        </div>
        <div className="grid grid-cols-2 gap-1.5" aria-label="Level filter">
          {levels.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onLevelChange(option.value)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] transition-all active:scale-[0.97]',
                selectedLevel === option.value
                  ? 'border-primary/50 bg-primary/10 text-primary shadow-[0_0_15px_rgba(var(--primary),0.1)]'
                  : 'border-border/40 bg-muted/20 text-foreground/40 hover:border-border hover:bg-muted/40 hover:text-foreground/80'
              )}
            >
              <span>{option.label}</span>
              <div
                className={cn(
                  'h-0.5 w-4 rounded-full transition-colors',
                  selectedLevel === option.value ? 'bg-primary' : 'bg-foreground/10'
                )}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Operational Deck */}
      <div className="mt-4 rounded-2xl border-2 border-border bg-card/40 p-1.5 shadow-xl shadow-black/5">
        <div className="rounded-[calc(1rem-2px)] border border-dashed border-border bg-background/60 p-4 space-y-5">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                Operational Window
              </p>
              <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-foreground/45">
                Tail Capacity
              </p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary/40" />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5" aria-label="Visible entries">
            {limits.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onLimitChange(option)}
                className={cn(
                  'rounded-md border py-1.5 text-[11px] font-semibold tabular-nums transition-all active:scale-[0.95]',
                  limit === option
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border/60 bg-muted/40 text-foreground/40 hover:bg-muted hover:text-foreground'
                )}
              >
                {option}
              </button>
            ))}
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="group relative h-10 w-full overflow-hidden rounded-xl border-none bg-primary text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-foreground transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/20 active:scale-[0.98]"
            onClick={onRefresh}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
            <div className="flex items-center gap-2">
              <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
              <span>Refresh Entries</span>
            </div>
          </Button>
        </div>
      </div>
    </div>
  );
}
