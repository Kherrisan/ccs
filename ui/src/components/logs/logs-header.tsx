import { RefreshCw, Settings, ScrollText, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FOCUS_RING } from './tokens';

export interface LogsHeaderProps {
  isFetching: boolean;
  hasError: boolean;
  capturedCount: number;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
}

/**
 * Calm 48px header for the logs surface.
 * - Title + icon on the left
 * - Live connection pill in the middle (idle/syncing/error)
 * - Refresh + settings buttons on the right
 *
 * No glows, no decorative captions, no scale animations.
 */
export function LogsHeader({
  isFetching,
  hasError,
  capturedCount,
  onRefresh,
  onOpenSettings,
  onOpenShortcuts,
}: LogsHeaderProps) {
  const status = hasError ? 'error' : isFetching ? 'syncing' : 'live';
  const statusLabel =
    status === 'error' ? 'Disconnected' : status === 'syncing' ? 'Syncing' : 'Live';
  const dotClass =
    status === 'error' ? 'bg-red-500' : status === 'syncing' ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-3">
        <ScrollText className="h-4 w-4 text-foreground/70" aria-hidden="true" />
        <h1 className="text-sm font-semibold tracking-tight text-foreground">Logs</h1>
        <span
          role="status"
          className="ml-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground/70"
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} aria-hidden="true" />
          {statusLabel}
        </span>
        <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
          {capturedCount} entries
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          aria-label="Refresh logs"
          className={cn('h-8 gap-2 px-2 text-xs font-medium', FOCUS_RING)}
        >
          <RefreshCw
            className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')}
            aria-hidden="true"
          />
          Refresh
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenShortcuts}
          aria-label="Show keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          className={cn('h-8 w-8', FOCUS_RING)}
        >
          <HelpCircle className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          aria-label="Open logging settings"
          className={cn('h-8 w-8', FOCUS_RING)}
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
