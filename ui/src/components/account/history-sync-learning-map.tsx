import { useState } from 'react';
import {
  ArrowRight,
  ArrowRightLeft,
  ChevronDown,
  Layers3,
  Link2,
  Unlink,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface HistorySyncLearningMapProps {
  isolatedCount: number;
  sharedStandardCount: number;
  deeperSharedCount: number;
  sharedGroups: string[];
  legacyTargetCount: number;
  cliproxyCount: number;
}

type StageTone = 'isolated' | 'shared' | 'deeper';

function StageTile({
  title,
  count,
  icon: Icon,
  tone,
}: {
  title: string;
  count: number;
  icon: LucideIcon;
  tone: StageTone;
}) {
  const toneClasses: Record<StageTone, { border: string; icon: string; count: string }> = {
    isolated: {
      border: 'border-blue-300/60 bg-blue-50/40 dark:border-blue-900/40 dark:bg-blue-900/10',
      icon: 'text-blue-700 dark:text-blue-400',
      count: 'text-blue-700 dark:text-blue-400',
    },
    shared: {
      border:
        'border-emerald-300/60 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-900/10',
      icon: 'text-emerald-700 dark:text-emerald-400',
      count: 'text-emerald-700 dark:text-emerald-400',
    },
    deeper: {
      border:
        'border-indigo-300/60 bg-indigo-50/40 dark:border-indigo-900/40 dark:bg-indigo-900/10',
      icon: 'text-indigo-700 dark:text-indigo-400',
      count: 'text-indigo-700 dark:text-indigo-400',
    },
  };

  return (
    <div className={cn('rounded-md border p-2.5', toneClasses[tone].border)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">{title}</p>
        <Icon className={cn('h-3.5 w-3.5', toneClasses[tone].icon)} />
      </div>
      <p className={cn('mt-1 text-lg font-mono font-semibold', toneClasses[tone].count)}>{count}</p>
    </div>
  );
}

export function HistorySyncLearningMap({
  isolatedCount,
  sharedStandardCount,
  deeperSharedCount,
  sharedGroups,
  legacyTargetCount,
  cliproxyCount,
}: HistorySyncLearningMapProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const groupsToShow = sharedGroups.length > 0 ? sharedGroups : ['default'];

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{t('historySyncLearningMap.title')}</CardTitle>
            <CardDescription className="mt-1">
              {t('historySyncLearningMap.description')}
            </CardDescription>
          </div>
          <Badge variant="outline">{t('historySyncLearningMap.learningMap')}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {cliproxyCount > 0 && (
          <div className="rounded-md border border-blue-300/60 bg-blue-50/40 px-3 py-2 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/10 dark:text-blue-300">
            {t('historySyncLearningMap.cliproxyManaged', { count: cliproxyCount })}
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
          <StageTile
            title={t('historySyncLearningMap.isolated')}
            count={isolatedCount}
            icon={Unlink}
            tone="isolated"
          />
          <div className="hidden sm:flex justify-center text-muted-foreground">
            <ArrowRight className="h-4 w-4" />
          </div>
          <StageTile
            title={t('historySyncLearningMap.shared')}
            count={sharedStandardCount}
            icon={Link2}
            tone="shared"
          />
          <div className="hidden sm:flex justify-center text-muted-foreground">
            <ArrowRight className="h-4 w-4" />
          </div>
          <StageTile
            title={t('historySyncLearningMap.deeper')}
            count={deeperSharedCount}
            icon={Waves}
            tone="deeper"
          />
        </div>

        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="h-8 w-full justify-between rounded-md px-2 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            >
              <span>{t('historySyncLearningMap.showDetails')}</span>
              <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="grid gap-2 lg:grid-cols-2">
              <div className="rounded-md border bg-muted/20 p-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="font-semibold">{t('historySyncLearningMap.modeSwitch')}</p>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {t('historySyncLearningMap.modeSwitchDesc')}
                </p>
              </div>

              <div className="rounded-md border bg-muted/20 p-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <Layers3 className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="font-semibold">{t('historySyncLearningMap.historySyncGroup')}</p>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {t('historySyncLearningMap.historySyncGroupDesc')}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {groupsToShow.map((group) => (
                    <Badge key={group} variant="outline" className="font-mono text-[10px]">
                      {group}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {legacyTargetCount > 0 && (
              <div className="mt-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                {t('historySyncLearningMap.legacyConfirmation', { count: legacyTargetCount })}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
