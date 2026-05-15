import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getSupportScopeLabels,
  type CliSupportEntry,
  type SupportScope,
} from '@/lib/support-updates-catalog';
import { SupportStatusBadge } from './support-status-badge';
import { useTranslation } from 'react-i18next';

const SCOPE_STYLES: Record<SupportScope, string> = {
  target:
    'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/50 dark:bg-violet-900/20 dark:text-violet-300',
  cliproxy:
    'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-900/20 dark:text-sky-300',
  'api-profiles':
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300',
  websearch:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300',
};

export function SupportEntryCard({ entry }: { entry: CliSupportEntry }) {
  const { t } = useTranslation();
  const scopeLabels = getSupportScopeLabels();
  const pillarLabels: { key: keyof CliSupportEntry['pillars']; label: string }[] = [
    { key: 'baseUrl', label: t('profileDialog.baseUrl') },
    { key: 'auth', label: t('copilotPage.auth') },
    { key: 'model', label: t('cliproxyTable.model') },
  ];

  return (
    <Card className="h-full gap-4">
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <CardTitle className="text-base leading-tight">{entry.name}</CardTitle>
            <CardDescription>{entry.summary}</CardDescription>
          </div>
          <SupportStatusBadge status={entry.status} />
        </div>

        <Badge variant="outline" className={SCOPE_STYLES[entry.scope]}>
          {scopeLabels[entry.scope]}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          {pillarLabels.map((pillar) => (
            <div key={pillar.key} className="rounded-md border bg-muted/30 p-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {pillar.label}
              </p>
              <p className="text-xs font-medium leading-relaxed">{entry.pillars[pillar.key]}</p>
            </div>
          ))}
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('updates.dashboard')}
          </p>
          <div className="flex flex-wrap gap-2">
            {entry.routes.map((route) => (
              <Link
                key={`${entry.id}-${route.path}`}
                to={route.path}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
              >
                {route.label}
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('updates.cliUsage')}
          </p>
          <div className="space-y-1">
            {entry.commands.slice(0, 2).map((command) => (
              <code
                key={`${entry.id}-${command}`}
                className="block rounded bg-muted px-2 py-1 text-[11px] leading-relaxed"
              >
                {command}
              </code>
            ))}
          </div>
        </div>

        {entry.notes && <p className="text-xs text-muted-foreground">{entry.notes}</p>}
      </CardContent>
    </Card>
  );
}
