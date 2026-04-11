import { useState } from 'react';
import { ArrowRightLeft, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CliproxyRoutingState, RoutingStrategy } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface RoutingGuidanceCardProps {
  className?: string;
  compact?: boolean;
  state?: CliproxyRoutingState;
  isLoading: boolean;
  isSaving: boolean;
  error?: Error | null;
  onApply: (strategy: RoutingStrategy) => void;
}

const STRATEGY_COPY: Record<RoutingStrategy, { title: string; description: string }> = {
  'round-robin': {
    title: 'Round Robin',
    description: 'Spread requests across matching accounts for even usage.',
  },
  'fill-first': {
    title: 'Fill First',
    description: 'Drain one healthy account first and keep backups untouched until needed.',
  },
};

export function RoutingGuidanceCard({
  className,
  compact = false,
  state,
  isLoading,
  isSaving,
  error,
  onApply,
}: RoutingGuidanceCardProps) {
  const currentStrategy = state?.strategy ?? 'round-robin';
  const [selected, setSelected] = useState<RoutingStrategy>(currentStrategy);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const sourceLabel = state?.source === 'live' ? 'Live CLIProxy' : 'Saved startup default';
  const saveDisabled = isLoading || isSaving || !state || selected === currentStrategy;
  const detailToggleLabel = detailsOpen ? 'Hide details' : 'Show details';

  if (compact) {
    const handleApply = (s: RoutingStrategy) => {
      setSelected(s);
      if (s !== currentStrategy) {
        onApply(s);
      }
    };

    return (
      <div
        className={cn(
          'group/routing flex items-center justify-between mt-1 p-1 -mx-1 rounded-lg transition-colors hover:bg-primary/5',
          className
        )}
      >
        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
          <div className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-background border border-border/60 text-muted-foreground shadow-sm overflow-hidden transition-all duration-300 group-hover/routing:border-primary/40 group-hover/routing:text-primary group-hover/routing:shadow-[0_0_12px_rgba(59,130,246,0.15)] dark:group-hover/routing:shadow-[0_0_12px_rgba(59,130,246,0.1)]">
            <div className="absolute inset-0 bg-primary/10 translate-y-full group-hover/routing:translate-y-0 transition-transform duration-300 ease-out" />
            <ArrowRightLeft className="relative z-10 h-3.5 w-3.5 transition-transform duration-300 group-hover/routing:scale-110" />
          </div>
          <span className="tracking-tight transition-colors duration-300 group-hover/routing:text-primary group-hover/routing:font-semibold">
            Routing
          </span>
          {isSaving && <RefreshCw className="ml-1 h-3 w-3 shrink-0 animate-spin text-primary" />}
        </div>

        <div className="relative grid grid-cols-2 p-0.5 gap-0.5 rounded-lg border border-border/60 bg-muted/30 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)] transition-colors duration-300 group-hover/routing:border-primary/20 group-hover/routing:bg-primary/5">
          <div
            className={cn(
              'absolute inset-y-0.5 left-0.5 w-[calc(50%-0.1875rem)] rounded bg-background shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/5 dark:ring-white/10 transition-all duration-300',
              selected === 'fill-first' ? 'translate-x-[calc(100%+0.125rem)]' : 'translate-x-0',
              'group-hover/routing:shadow-[0_0_8px_rgba(59,130,246,0.15)] dark:group-hover/routing:shadow-[0_0_8px_rgba(59,130,246,0.1)] group-hover/routing:ring-primary/30'
            )}
            style={{ transitionTimingFunction: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}
          />
          {(
            Object.entries(STRATEGY_COPY) as Array<
              [RoutingStrategy, { title: string; description: string }]
            >
          ).map(([strategy, copy]) => {
            const active = selected === strategy;
            return (
              <button
                key={strategy}
                type="button"
                className={cn(
                  'relative z-10 flex items-center justify-center rounded px-2.5 py-0.5 text-[10px] font-medium whitespace-nowrap transition-colors duration-200',
                  active
                    ? 'text-foreground group-hover/routing:text-primary'
                    : 'text-muted-foreground/70 hover:text-foreground/90 group-hover/routing:text-muted-foreground/90'
                )}
                onClick={() => handleApply(strategy)}
                disabled={isLoading || isSaving || !!error}
                title={copy.description}
              >
                {copy.title}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <section className={cn('rounded-xl border border-border/70 bg-background', className)}>
      <div className="grid gap-3 px-4 py-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-primary">
              <ArrowRightLeft className="h-4 w-4" />
            </div>
            <div className="text-sm font-medium">Routing strategy</div>
            <Badge variant="secondary">{currentStrategy}</Badge>
            {state ? <Badge variant="outline">{sourceLabel}</Badge> : null}
            {state ? <Badge variant="outline">{state.target}</Badge> : null}
          </div>
          <p className="max-w-3xl text-xs leading-5 text-muted-foreground">
            Proxy-wide account rotation. CCS keeps round-robin as the default until you explicitly
            change it.
          </p>
        </div>

        <div className="flex flex-col gap-2 xl:items-end">
          <div className="inline-flex flex-wrap rounded-lg border border-border/70 bg-muted/35 p-1">
            {(
              Object.entries(STRATEGY_COPY) as Array<
                [RoutingStrategy, { title: string; description: string }]
              >
            ).map(([strategy, copy]) => {
              const active = selected === strategy;
              return (
                <button
                  key={strategy}
                  type="button"
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setSelected(strategy)}
                  disabled={isLoading || isSaving || !!error}
                >
                  {copy.title}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground"
              onClick={() => setDetailsOpen((open) => !open)}
            >
              {detailsOpen ? (
                <ChevronUp className="mr-1 h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="mr-1 h-3.5 w-3.5" />
              )}
              {detailToggleLabel}
            </Button>
            <Button size="sm" onClick={() => onApply(selected)} disabled={saveDisabled || !!error}>
              {isSaving ? 'Saving...' : `Use ${selected}`}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground xl:col-span-2">
          <span>Round robin spreads usage.</span>
          <span className="hidden text-border sm:inline">•</span>
          <span>Fill first keeps backup accounts cold until they are needed.</span>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm xl:col-span-2">
            {error.message}
          </div>
        ) : null}
        {!error && state?.message ? (
          <div className="rounded-lg border border-border/70 bg-muted/35 px-3 py-2 text-xs text-muted-foreground xl:col-span-2">
            {state.message}
          </div>
        ) : null}

        {detailsOpen ? (
          <div className="grid gap-4 border-t border-border/60 pt-3 md:grid-cols-2 xl:col-span-2">
            {(
              Object.entries(STRATEGY_COPY) as Array<
                [RoutingStrategy, { title: string; description: string }]
              >
            ).map(([strategy, copy]) => {
              const current = currentStrategy === strategy;
              return (
                <div key={strategy} className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium">{copy.title}</div>
                    {current ? <Badge variant="secondary">Current</Badge> : null}
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">{copy.description}</p>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
