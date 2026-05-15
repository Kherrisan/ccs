import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Link2,
  ShieldAlert,
  Unlink,
  Waves,
  ArrowRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { PlainCcsLane } from '@/lib/api-client';

interface ContinuityOverviewProps {
  totalAccounts: number;
  primaryAccountName?: string | null;
  isolatedCount: number;
  sharedStandardCount: number;
  deeperSharedCount: number;
  sharedAloneCount: number;
  sharedPeerAccountCount: number; // The accounts in a viable group
  deeperReadyAccountCount: number;
  sharedGroups: string[];
  sharedPeerGroups: string[];
  deeperReadyGroups: string[];
  legacyTargetCount: number;
  cliproxyCount: number;
  plainCcsLane: PlainCcsLane | null;
}

type ReadinessState =
  | 'single'
  | 'isolated'
  | 'shared-alone'
  | 'shared-standard'
  | 'partial'
  | 'ready';

const InfoTooltip = ({ titleKey, descKey }: { titleKey: string; descKey: string }) => {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t(titleKey)}
          className="h-5 w-5 rounded-full hover:bg-muted text-muted-foreground/70 transition-colors"
        >
          <Info className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-4 rounded-xl shadow-lg border-border/50 text-sm"
        side="top"
        align="center"
      >
        <p className="font-semibold tracking-tight">{t(titleKey)}</p>
        <p className="mt-1.5 text-muted-foreground leading-relaxed">{t(descKey)}</p>
      </PopoverContent>
    </Popover>
  );
};

export function ContinuityOverview({
  totalAccounts,
  primaryAccountName,
  isolatedCount,
  sharedStandardCount,
  deeperSharedCount,
  sharedAloneCount,
  sharedPeerAccountCount,
  deeperReadyAccountCount,
  sharedPeerGroups,
  deeperReadyGroups,
  legacyTargetCount,
  cliproxyCount,
  plainCcsLane,
}: ContinuityOverviewProps) {
  const { t } = useTranslation();
  const laneLabel = plainCcsLane
    ? plainCcsLane.kind === 'native'
      ? t('continuityOverview.lane.native')
      : plainCcsLane.kind === 'account-default'
        ? t('continuityOverview.lane.accountDefault', {
            name: plainCcsLane.account_name || '',
          })
        : plainCcsLane.kind === 'account-inherited'
          ? t('continuityOverview.lane.accountInherited', {
              name: plainCcsLane.account_name || '',
            })
          : plainCcsLane.kind === 'profile-default'
            ? t('continuityOverview.lane.profileDefault', {
                name: plainCcsLane.profile_name || 'default',
              })
            : plainCcsLane.label
    : '';

  const readiness: ReadinessState =
    totalAccounts < 2
      ? 'single'
      : sharedPeerGroups.length === 0
        ? isolatedCount === totalAccounts
          ? 'isolated'
          : 'shared-alone'
        : deeperReadyGroups.length === 0
          ? 'shared-standard'
          : isolatedCount > 0 ||
              sharedAloneCount > 0 ||
              deeperReadyAccountCount < sharedPeerAccountCount ||
              deeperReadyGroups.length < sharedPeerGroups.length
            ? 'partial'
            : 'ready';

  const highlightGroup = deeperReadyGroups[0] || sharedPeerGroups[0] || 'default';
  const hasMixedState =
    deeperReadyGroups.length > 0 &&
    (isolatedCount > 0 ||
      sharedStandardCount > 0 ||
      sharedPeerGroups.length > deeperReadyGroups.length);

  const iconMap = {
    ready: <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />,
    'shared-standard': <Link2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />,
    single: <ShieldAlert className="h-6 w-6 text-stone-400" />,
    isolated: <Unlink className="h-6 w-6 text-amber-600 dark:text-amber-400" />,
    'shared-alone': <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />,
    partial: <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />,
  };

  const currentIcon = iconMap[readiness];
  const plainLaneUsesPrimaryAccount =
    !!primaryAccountName && plainCcsLane?.account_name === primaryAccountName;
  const showPlainLaneRecovery =
    totalAccounts > 0 && !!plainCcsLane && (!primaryAccountName || !plainLaneUsesPrimaryAccount);
  const showSharedRecoverySteps = totalAccounts > 1 && readiness !== 'ready';

  return (
    <div className="flex flex-col gap-4">
      {/* Primary Status Bento Box */}
      <Card className="flex flex-col justify-between overflow-hidden relative group p-0 border-border bg-card shadow-sm hover:shadow-md transition-shadow duration-300">
        <CardContent className="p-6 flex flex-col h-full bg-gradient-to-br from-card to-muted/20 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="rounded-2xl bg-background p-3 shadow-sm ring-1 ring-border/50 self-start shrink-0">
                {currentIcon}
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold tracking-tight">
                    {t(`continuityReadiness.messages.${readiness}.title`, {
                      group: highlightGroup,
                    })}
                  </h3>
                  <Badge
                    variant={readiness === 'ready' ? 'default' : 'secondary'}
                    className="rounded-full px-2.5 py-0.5 font-medium shadow-sm"
                  >
                    {t(`continuityReadiness.state.${readiness}`)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
                  {t(`continuityReadiness.messages.${readiness}.description`, {
                    group: highlightGroup,
                    count: sharedAloneCount,
                  })}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-4 flex flex-wrap items-center gap-2">
            {cliproxyCount > 0 && (
              <Badge
                variant="outline"
                className="text-blue-700 bg-blue-50/50 border-blue-200/60 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300"
              >
                {t('historySyncLearningMap.cliproxyManaged', { count: cliproxyCount })}
              </Badge>
            )}
            {legacyTargetCount > 0 && (
              <Badge
                variant="outline"
                className="text-amber-700 bg-amber-50/50 border-amber-200/60 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300"
              >
                {t('historySyncLearningMap.legacyConfirmation', { count: legacyTargetCount })}
              </Badge>
            )}
            {sharedPeerGroups.length > 0 && deeperReadyGroups.length === 0 && (
              <Badge
                variant="secondary"
                className="font-mono text-[11px] px-2 bg-muted/50 text-muted-foreground border-transparent"
              >
                {t('continuityOverview.recommendBadge', { group: highlightGroup })}
              </Badge>
            )}
            {hasMixedState && (
              <Badge
                variant="secondary"
                className="font-mono text-[11px] px-2 bg-muted/50 text-muted-foreground border-transparent"
              >
                {t('continuityOverview.partialBadge', { group: highlightGroup })}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {(showPlainLaneRecovery || showSharedRecoverySteps) && (
        <Card className="border-dashed">
          <CardContent className="p-5 space-y-4">
            {showPlainLaneRecovery && (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {t('continuityOverview.plainLaneTitle')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('continuityOverview.plainLaneDescription', {
                      lane: laneLabel || 'plain ccs',
                    })}
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="rounded-md border bg-background px-2 py-2 font-mono text-[11px] flex items-start gap-2">
                    <span className="flex-1 break-all">ccs -r</span>
                    <CopyButton value="ccs -r" size="icon" />
                  </div>
                  <div className="rounded-md border bg-background px-2 py-2 font-mono text-[11px] flex items-start gap-2">
                    <span className="flex-1 break-all">ccs auth backup default</span>
                    <CopyButton value="ccs auth backup default" size="icon" />
                  </div>
                  {primaryAccountName ? (
                    <div className="rounded-md border bg-background px-2 py-2 font-mono text-[11px] flex items-start gap-2">
                      <span className="flex-1 break-all">
                        {`ccs auth default ${primaryAccountName}`}
                      </span>
                      <CopyButton value={`ccs auth default ${primaryAccountName}`} size="icon" />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t('continuityOverview.setDefaultHint')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {showSharedRecoverySteps && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">
                  {t('continuityReadiness.stepsTitle')}
                </p>
                <ol className="space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>{t('continuityReadiness.steps.syncBoth')}</li>
                  <li>{t('continuityReadiness.steps.sameGroup', { group: highlightGroup })}</li>
                  <li>{t('continuityReadiness.steps.enableDeeper')}</li>
                  <li>{t('continuityReadiness.steps.resumeOriginal')}</li>
                </ol>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Horizontal Progression Chain */}
      <div className="flex flex-col md:flex-row items-center gap-3">
        <div className="flex-1 w-full flex items-center justify-between p-3.5 rounded-xl border border-blue-300/40 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-900/10 shadow-sm transition-colors hover:bg-blue-100/40 dark:hover:bg-blue-900/20">
          <div className="flex items-center gap-2">
            <Unlink className="h-4 w-4 text-blue-700/80 dark:text-blue-400/80" />
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-900 dark:text-blue-200">
              {t('historySyncLearningMap.isolated')}
            </span>
            <InfoTooltip titleKey="accountsPage.isolated" descKey="accountsPage.isolatedDesc" />
          </div>
          <span className="text-lg font-mono font-bold text-blue-900 dark:text-blue-200">
            {isolatedCount}
          </span>
        </div>

        <ArrowRight className="hidden md:block h-4 w-4 text-muted-foreground/40 shrink-0" />

        <div className="flex-1 w-full flex items-center justify-between p-3.5 rounded-xl border border-emerald-300/40 bg-emerald-50/50 dark:border-emerald-900/30 dark:bg-emerald-900/10 shadow-sm transition-colors hover:bg-emerald-100/40 dark:hover:bg-emerald-900/20">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-emerald-700/80 dark:text-emerald-400/80" />
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-900 dark:text-emerald-200">
              {t('historySyncLearningMap.shared')}
            </span>
            <InfoTooltip
              titleKey="accountsPage.sharedStandard"
              descKey="accountsPage.sharedStandardDesc"
            />
          </div>
          <span className="text-lg font-mono font-bold text-emerald-900 dark:text-emerald-200">
            {sharedStandardCount}
          </span>
        </div>

        <ArrowRight className="hidden md:block h-4 w-4 text-muted-foreground/40 shrink-0" />

        <div className="flex-1 w-full flex items-center justify-between p-3.5 rounded-xl border border-indigo-300/40 bg-indigo-50/50 dark:border-indigo-900/30 dark:bg-indigo-900/10 shadow-sm transition-colors hover:bg-indigo-100/40 dark:hover:bg-indigo-900/20">
          <div className="flex items-center gap-2">
            <Waves className="h-4 w-4 text-indigo-700/80 dark:text-indigo-400/80" />
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
              {t('historySyncLearningMap.deeper')}
            </span>
            <InfoTooltip
              titleKey="accountsPage.sharedDeeper"
              descKey="accountsPage.sharedDeeperDesc"
            />
          </div>
          <span className="text-lg font-mono font-bold text-indigo-900 dark:text-indigo-200">
            {deeperSharedCount}
          </span>
        </div>
      </div>
    </div>
  );
}
