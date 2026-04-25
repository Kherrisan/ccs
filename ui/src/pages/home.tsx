import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ActivityIcon,
  AlertTriangle,
  ArrowRight,
  KeyIcon,
  ScrollText,
  ShieldCheck,
  UsersIcon,
  Zap,
} from 'lucide-react';
import { AuthMonitor } from '@/components/monitoring/auth-monitor';
import { ErrorLogsMonitor } from '@/components/error-logs-monitor';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useOverview } from '@/hooks/use-overview';
import { useSharedSummary } from '@/hooks/use-shared';
import { PageShell, PageHeader } from '@/components/page-shell';
import {
  MonitorLayout,
  KpiRow,
  KpiCard,
  MonitorGrid,
  MonitorCard,
} from '@/components/monitor-layout';

const HEALTH_TONE = {
  ok: 'positive',
  warning: 'warning',
  error: 'negative',
} as const;

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: overview, isLoading: isOverviewLoading } = useOverview();
  const { data: shared, isLoading: isSharedLoading } = useSharedSummary();

  if (isOverviewLoading || isSharedLoading) {
    return <HomeLoadingSkeleton />;
  }

  const healthTone = overview?.health
    ? HEALTH_TONE[overview.health.status as keyof typeof HEALTH_TONE]
    : 'default';

  return (
    <PageShell>
      <PageHeader
        title={t('heroSection.title')}
        description={t('heroSection.subtitle')}
        status={
          overview?.version && (
            <Badge variant="outline" className="font-mono text-xs">
              v{overview.version}
            </Badge>
          )
        }
      />
      <MonitorLayout
        kpis={
          <KpiRow>
            <KpiCard
              label={t('home.profiles')}
              value={overview?.profiles ?? 0}
              icon={<KeyIcon className="size-4" />}
            />
            <KpiCard
              label={t('home.cliproxy')}
              value={overview?.cliproxy ?? 0}
              icon={<Zap className="size-4" />}
            />
            <KpiCard
              label={t('home.accounts')}
              value={overview?.accounts ?? 0}
              icon={<UsersIcon className="size-4" />}
            />
            <KpiCard
              label={t('home.health')}
              value={overview?.health ? `${overview.health.passed}/${overview.health.total}` : '—'}
              tone={healthTone}
              icon={<ActivityIcon className="size-4" />}
            />
          </KpiRow>
        }
      >
        {shared?.symlinkStatus && !shared.symlinkStatus.valid && (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t('home.configurationRequired')}</AlertTitle>
            <AlertDescription>{shared.symlinkStatus.message}</AlertDescription>
          </Alert>
        )}

        <MonitorGrid>
          {/* Live account monitor — primary viz */}
          <MonitorCard
            span={12}
            title={
              <span className="flex items-center gap-2">
                <ShieldCheck className="size-4" />
                Live account monitor
              </span>
            }
          >
            <AuthMonitor />
          </MonitorCard>

          {/* Logs callout */}
          <MonitorCard span={12}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-muted p-2.5">
                  <ScrollText className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base font-semibold">{t('homePageV2.logsMoved')}</h2>
                  <p className="max-w-2xl text-sm text-muted-foreground">
                    Use the unified logs page for source-level filtering, structured entry
                    inspection, and retention policy edits without crowding the home dashboard.
                  </p>
                </div>
              </div>
              <Button variant="outline" className="gap-2" onClick={() => navigate('/logs')}>
                Open logs
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </MonitorCard>

          {/* Recent errors */}
          <MonitorCard
            span={12}
            title={
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-4" />
                Recent errors
              </span>
            }
          >
            <ErrorLogsMonitor />
          </MonitorCard>
        </MonitorGrid>
      </MonitorLayout>
    </PageShell>
  );
}

function HomeLoadingSkeleton() {
  return (
    <PageShell>
      <PageHeader title={<Skeleton className="h-6 w-40" />} />
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
        </MonitorGrid>
      </MonitorLayout>
    </PageShell>
  );
}
