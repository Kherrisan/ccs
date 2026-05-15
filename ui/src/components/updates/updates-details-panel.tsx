import { Link } from 'react-router-dom';
import { CalendarClock, CheckCircle2, EyeOff, RotateCcw, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SupportStatusBadge } from '@/components/updates/support-status-badge';
import { NoticeProgressBadge } from '@/components/updates/notice-progress-badge';
import { UpdatesNoticeActionRow } from '@/components/updates/updates-notice-action-row';
import {
  getSupportScopeLabels,
  formatCatalogDate,
  type CliSupportEntry,
  type SupportNotice,
} from '@/lib/support-updates-catalog';
import { type NoticeProgressState } from '@/lib/updates-notice-state';
import { useTranslation } from 'react-i18next';

type UpdatableNoticeProgress = 'new' | 'seen' | 'done' | 'dismissed';

export function UpdatesDetailsPanel({
  notice,
  progress,
  relatedEntries,
  onUpdateProgress,
}: {
  notice: SupportNotice | null;
  progress: NoticeProgressState | null;
  relatedEntries: CliSupportEntry[];
  onUpdateProgress: (nextState: UpdatableNoticeProgress) => void;
}) {
  const { t } = useTranslation();
  const scopeLabels = getSupportScopeLabels();
  if (!notice) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed bg-muted/20 p-6">
        <p className="text-sm text-muted-foreground">{t('updates.noUpdates')}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 bg-background grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <div className="border-b bg-background px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 className="text-base font-semibold leading-tight">{notice.title}</h2>
            <p className="text-sm text-muted-foreground">{notice.summary}</p>
          </div>
          <div className="flex items-center gap-2">
            {progress && <NoticeProgressBadge state={progress} />}
            <SupportStatusBadge status={notice.status} />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" />
          <span>{t('updates.published', { date: formatCatalogDate(notice.publishedAt) })}</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onUpdateProgress('done')}>
            <CheckCircle2 className="h-4 w-4" />
            {t('updates.markDone')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => onUpdateProgress('dismissed')}>
            <EyeOff className="h-4 w-4" />
            {t('updates.dismiss')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onUpdateProgress('new')}>
            <RotateCcw className="h-4 w-4" />
            {t('updates.reopen')}
          </Button>
        </div>
      </div>

      <div className="min-h-0 p-4">
        <div className="grid h-full gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)] overflow-hidden">
          <Card className="h-full overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">{t('updates.doNext')}</CardTitle>
              </div>
              <CardDescription>{notice.primaryAction}</CardDescription>
            </CardHeader>
            <CardContent className="min-h-0">
              <ScrollArea className="h-full pr-2">
                <div className="space-y-3">
                  {notice.actions.map((action) => (
                    <UpdatesNoticeActionRow key={`${notice.id}-${action.id}`} action={action} />
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="grid h-full grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-4 overflow-hidden">
            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('updates.impactedIntegrations')}</CardTitle>
                <CardDescription>{t('updates.impactedDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="min-h-0">
                <ScrollArea className="h-full pr-2">
                  <div className="space-y-2">
                    {relatedEntries.map((entry) => (
                      <div key={entry.id} className="rounded-md border bg-muted/20 p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-medium">{entry.name}</p>
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                            {scopeLabels[entry.scope]}
                          </Badge>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          {entry.routes[0] && (
                            <Button size="sm" variant="outline" asChild>
                              <Link to={entry.routes[0].path}>{entry.routes[0].label}</Link>
                            </Button>
                          )}
                          {entry.commands[0] && (
                            <div className="ml-auto flex min-w-0 items-center gap-1.5">
                              <code className="truncate rounded bg-background px-1.5 py-0.5 text-[11px]">
                                {entry.commands[0]}
                              </code>
                              <CopyButton value={entry.commands[0]} />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('updates.whyMatters')}</CardTitle>
                <CardDescription>{t('updates.whyMattersDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="min-h-0">
                <ScrollArea className="h-full pr-2">
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {notice.highlights.map((highlight) => (
                      <li key={`${notice.id}-${highlight}`}>- {highlight}</li>
                    ))}
                  </ul>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
