import type { ReactNode } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface MonitorLayoutProps {
  /** Optional KPI row above the grid (use <KpiRow>). Render only when ≤4 hero numbers. */
  kpis?: ReactNode;
  /** Page body — typically a <MonitorGrid> of <MonitorCard>s. */
  children: ReactNode;
  className?: string;
}

/**
 * MonitorLayout - Body wrapper for Monitor archetype pages (home, analytics, health, logs).
 *
 * - Optional KPI row pinned above the grid
 * - Scrollable body
 *
 * Compose inside <PageShell>:
 *   <PageShell>
 *     <PageHeader …/>
 *     <MonitorLayout kpis={<KpiRow>…</KpiRow>}>
 *       <MonitorGrid>…</MonitorGrid>
 *     </MonitorLayout>
 *   </PageShell>
 */
export function MonitorLayout({ kpis, children, className }: MonitorLayoutProps) {
  return (
    <ScrollArea className={cn('flex-1', className)}>
      <div className="space-y-4 p-4 sm:p-6">
        {kpis}
        {children}
      </div>
    </ScrollArea>
  );
}
