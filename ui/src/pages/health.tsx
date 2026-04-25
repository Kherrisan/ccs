import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Cpu,
  Info,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HealthGauge } from '@/components/health/health-gauge';
import { HealthGroupSection } from '@/components/health/health-group-section';
import { useHealth, type HealthGroup } from '@/hooks/use-health';
import { cn } from '@/lib/utils';
import { PageShell, PageHeader } from '@/components/page-shell';
import {
  MonitorLayout,
  KpiRow,
  KpiCard,
  MonitorGrid,
  MonitorCard,
} from '@/components/monitor-layout';

function getOverallStatus(summary: { passed: number; warnings: number; errors: number }) {
  if (summary.errors > 0) return 'error';
  if (summary.warnings > 0) return 'warning';
  return 'ok';
}

function formatRelativeTime(
  timestamp: number,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return t('health.justNow');
  if (seconds < 60) return t('health.secondsAgo', { count: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('health.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  return t('health.hoursAgo', { count: hours });
}

function sortGroupsByIssues(groups: HealthGroup[]): HealthGroup[] {
  return [...groups].sort((a, b) => {
    const aErrors = a.checks.filter((c) => c.status === 'error').length;
    const bErrors = b.checks.filter((c) => c.status === 'error').length;
    const aWarnings = a.checks.filter((c) => c.status === 'warning').length;
    const bWarnings = b.checks.filter((c) => c.status === 'warning').length;
    if (aErrors !== bErrors) return bErrors - aErrors;
    return bWarnings - aWarnings;
  });
}

export function HealthPage() {
  const { t } = useTranslation();
  const { data, isLoading, refetch, dataUpdatedAt } = useHealth();

  // Force re-render every second so the relative-time label stays fresh.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  void tick;

  const copyDoctorCommand = () => {
    navigator.clipboard.writeText('ccs doctor');
    toast.success(t('health.copied'));
  };

  const handleRefresh = () => {
    refetch();
    toast.info(t('health.refreshing'));
  };

  if (isLoading && !data) {
    return <HealthLoadingSkeleton />;
  }

  const overallStatus = data ? getOverallStatus(data.summary) : 'ok';
  const sortedGroups = data?.groups ? sortGroupsByIssues(data.groups) : [];

  return (
    <PageShell>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {t('health.systemHealth')}
            {data?.version && (
              <Badge variant="outline" className="font-mono text-xs">
                {t('health.build', { version: data.version })}
              </Badge>
            )}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <Cpu className="size-3.5" />
            <span>{t('health.lastScan')}</span>
            <span>{dataUpdatedAt ? formatRelativeTime(dataUpdatedAt, t) : '--'}</span>
            <span className="text-muted-foreground/60">|</span>
            <span>{t('health.autoRefresh')}</span>
            <span className="text-emerald-600 dark:text-emerald-400">30s</span>
          </span>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={copyDoctorCommand}
              className="gap-2 font-mono text-xs"
            >
              <Terminal className="size-3.5" />
              ccs doctor
              <Copy className="size-3 opacity-50" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              className="gap-2"
            >
              <RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />
              <span className="hidden sm:inline">{t('health.refresh')}</span>
            </Button>
          </>
        }
      />

      <MonitorLayout
        kpis={
          data && (
            <KpiRow>
              <KpiCard
                label={t('health.checks') ?? 'Checks'}
                value={data.summary.total}
                hint={`${data.summary.passed} ${t('health.ok') ?? 'OK'}`}
                tone="default"
                icon={<Activity className="size-4" />}
              />
              <KpiCard
                label="Passed"
                value={data.summary.passed}
                tone="positive"
                icon={<CheckCircle2 className="size-4" />}
              />
              <KpiCard
                label="Warnings"
                value={data.summary.warnings}
                tone={data.summary.warnings > 0 ? 'warning' : 'default'}
                icon={<AlertTriangle className="size-4" />}
              />
              <KpiCard
                label="Errors"
                value={data.summary.errors}
                tone={data.summary.errors > 0 ? 'negative' : 'default'}
                icon={<Info className="size-4" />}
              />
            </KpiRow>
          )
        }
      >
        <MonitorGrid>
          {/* Hero: overall health gauge with terminal aesthetic */}
          {data && (
            <MonitorCard
              span={12}
              variant="terminal"
              title={
                <span className="flex items-center gap-2 font-mono">
                  <span className="text-emerald-500">$</span>
                  ccs doctor
                </span>
              }
              meta={data.summary.info > 0 ? `${data.summary.info} info` : undefined}
            >
              <div className="flex flex-col items-center gap-6 py-2 sm:flex-row sm:justify-center">
                <HealthGauge
                  passed={data.summary.passed}
                  total={data.summary.total - data.summary.info}
                  status={overallStatus}
                  size="md"
                />
                <div className="text-center font-mono text-sm text-emerald-300 sm:text-left">
                  <p className="text-xs uppercase tracking-wider opacity-70">Status</p>
                  <p className="text-2xl font-bold">
                    {overallStatus === 'ok' && 'All systems nominal'}
                    {overallStatus === 'warning' && 'Attention required'}
                    {overallStatus === 'error' && 'Errors detected'}
                  </p>
                  <p className="mt-1 text-xs opacity-70">
                    {data.summary.passed}/{data.summary.total - data.summary.info} non-informational
                    checks passing
                  </p>
                </div>
              </div>
            </MonitorCard>
          )}

          {/* Each health group becomes its own MonitorCard */}
          {sortedGroups.map((group, index) => (
            <MonitorCard key={group.id} span={12}>
              <HealthGroupSection
                group={group}
                defaultOpen={
                  index < 2 ||
                  group.checks.some((c) => c.status === 'error' || c.status === 'warning')
                }
              />
            </MonitorCard>
          ))}
        </MonitorGrid>

        {/* Footer */}
        <div className="flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>
              {t('health.version')} <span className="font-mono">{data?.version ?? '--'}</span>
            </span>
            <span>
              {t('health.platform')}{' '}
              <span className="font-mono">
                {typeof navigator !== 'undefined' ? navigator.platform : 'linux'}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="size-2 animate-pulse rounded-full bg-emerald-500" />
            <span>{t('health.liveMonitoring')}</span>
          </div>
        </div>
      </MonitorLayout>
    </PageShell>
  );
}

function HealthLoadingSkeleton() {
  return (
    <PageShell>
      <PageHeader title={<Skeleton className="h-6 w-48" />} />
      <MonitorLayout
        kpis={
          <KpiRow>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </KpiRow>
        }
      >
        <MonitorGrid>
          <MonitorCard span={12}>
            <Skeleton className="h-48 w-full rounded" />
          </MonitorCard>
          {[1, 2, 3].map((i) => (
            <MonitorCard key={i} span={12}>
              <Skeleton className="h-16 w-full rounded" />
            </MonitorCard>
          ))}
        </MonitorGrid>
      </MonitorLayout>
    </PageShell>
  );
}
