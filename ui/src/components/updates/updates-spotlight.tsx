import { Link } from 'react-router-dom';
import { BellRing, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatCatalogDate, getLatestSupportNotice } from '@/lib/support-updates-catalog';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export function UpdatesSpotlight({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const latest = getLatestSupportNotice();
  const { t } = useTranslation();
  if (!latest) {
    return null;
  }

  const primaryCommand = latest.commands[0];

  return (
    <Alert variant="info" className={cn('border-dashed', className)}>
      <BellRing className="h-4 w-4" />
      <AlertTitle className="flex flex-wrap items-center gap-2">
        <span>{latest.title}</span>
        <span className="text-xs font-normal text-blue-700/80 dark:text-blue-300/80">
          {formatCatalogDate(latest.publishedAt)}
        </span>
      </AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{latest.summary}</p>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Link
            to="/updates"
            className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline dark:text-blue-300"
          >
            {t('updatesSpotlight.openUpdatesCenter')}
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>

          {!compact && primaryCommand && (
            <code className="rounded bg-blue-100/70 px-1.5 py-0.5 font-mono text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
              {primaryCommand}
            </code>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
