import { Activity, Archive, Database, RadioTower } from 'lucide-react';
import type { LogsConfig, LogsEntry, LogsSource } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { formatCount, formatLogTimestamp, formatRelativeLogTime } from './utils';
// TODO i18n: import { useTranslation } from 'react-i18next'; when keys are ready

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
  accent: string;
}) {
  return (
    <div className="rounded-xl border bg-card/80 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
        <div className={cn('rounded-xl p-2.5', accent)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export function LogsOverviewCards({
  config,
  sources,
  entries,
  latestTimestamp,
}: {
  config: LogsConfig;
  sources: LogsSource[];
  entries: LogsEntry[];
  latestTimestamp: string | null;
}) {
  // TODO i18n: uncomment when keys for Pipeline/Retention/Coverage/Visible Entries are added
  // const { t } = useTranslation();
  const nativeSources = sources.filter((source) => source.kind === 'native').length;
  const legacySources = sources.length - nativeSources;
  const errorCount = entries.filter((entry) => entry.level === 'error').length;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {/* TODO i18n: missing keys for Pipeline/Retention/Coverage/Visible Entries labels and detail strings */}
      <MetricCard
        label="Pipeline"
        value={config.enabled ? 'Enabled' : 'Disabled'}
        detail={`Threshold: ${config.level.toUpperCase()} • Redaction ${config.redact ? 'on' : 'off'}`}
        icon={RadioTower}
        accent={
          config.enabled
            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300'
        }
      />
      <MetricCard
        label="Retention"
        value={`${config.retain_days}d`}
        detail={`Rotate at ${config.rotate_mb} MB per file`}
        icon={Archive}
        accent="bg-amber-500/10 text-amber-700 dark:text-amber-300"
      />
      <MetricCard
        label="Coverage"
        value={formatCount(sources.length)}
        detail={`${nativeSources} active sources${legacySources > 0 ? ` • ${legacySources} legacy` : ''}`}
        icon={Database}
        accent="bg-sky-500/10 text-sky-700 dark:text-sky-300"
      />
      <MetricCard
        label="Visible Entries"
        value={formatCount(entries.length)}
        detail={`${formatCount(errorCount)} errors • ${formatRelativeLogTime(latestTimestamp)}`}
        icon={Activity}
        accent="bg-violet-500/10 text-violet-700 dark:text-violet-300"
      />
      <div className="md:col-span-2 xl:col-span-4 rounded-2xl border border-border/70 bg-card/70 px-4 py-3 text-sm text-muted-foreground shadow-sm">
        Last ingested event:{' '}
        <span className="font-medium text-foreground">{formatLogTimestamp(latestTimestamp)}</span>
      </div>
    </div>
  );
}
