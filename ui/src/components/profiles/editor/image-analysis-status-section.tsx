import { ArrowUpRight, Image as ImageIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { CliTarget, ImageAnalysisStatus } from '@/lib/api-client';

interface ImageAnalysisStatusSectionProps {
  status?: ImageAnalysisStatus | null;
  target?: CliTarget;
  source?: 'saved' | 'editor';
  previewState?: 'saved' | 'preview' | 'refreshing' | 'invalid';
  nativeReadPreferenceOverride?: boolean;
  onToggleNativeRead?: (enabled: boolean) => void;
}

function getPreviewLabel(
  t: (key: string) => string,
  source: 'saved' | 'editor',
  previewState: ImageAnalysisStatusSectionProps['previewState']
) {
  if (previewState === 'refreshing') return t('imageAnalysisStatus.refreshingPreview');
  if (previewState === 'invalid') return t('imageAnalysisStatus.savedStatus');
  return source === 'editor'
    ? t('imageAnalysisStatus.livePreview')
    : t('imageAnalysisStatus.savedStatus');
}

function getHeaderLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  status: ImageAnalysisStatus,
  target: CliTarget
): string {
  if (status.status === 'disabled') return t('imageAnalysisStatus.disabledGlobally');
  if (target !== 'claude')
    return t('imageAnalysisStatus.targetBypassesHook', {
      target: t(`imageAnalysisStatus.targetLabel.${target}`),
    });
  if (status.nativeReadPreference) return t('imageAnalysisStatus.nativeImageReading');
  if (status.status === 'hook-missing') return t('imageAnalysisStatus.setupNeeded');
  if (status.authReadiness === 'missing') return t('imageAnalysisStatus.needsAuth');
  if (status.proxyReadiness === 'unavailable') return t('imageAnalysisStatus.needsProxy');
  if (status.effectiveRuntimeMode === 'native-read') return t('imageAnalysisStatus.nativeFallback');
  return t('imageAnalysisStatus.transformerReady');
}

function getHeaderBadge(
  t: (key: string) => string,
  status: ImageAnalysisStatus,
  target: CliTarget
): {
  label: string;
  className: string;
} {
  if (status.status === 'disabled') {
    return {
      label: t('imageAnalysisStatus.badgeDisabled'),
      className: 'border-border/80 bg-background/85 text-muted-foreground',
    };
  }
  if (target !== 'claude') {
    return {
      label: t('imageAnalysisStatus.badgeBypassed'),
      className: 'border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-200',
    };
  }
  if (status.nativeReadPreference) {
    return {
      label: t('imageAnalysisStatus.badgeNative'),
      className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
    };
  }
  if (status.status === 'hook-missing' || status.authReadiness === 'missing') {
    return {
      label:
        status.status === 'hook-missing'
          ? t('imageAnalysisStatus.badgeSetup')
          : t('imageAnalysisStatus.badgeAuth'),
      className: 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200',
    };
  }
  if (status.proxyReadiness === 'unavailable') {
    return {
      label: t('imageAnalysisStatus.badgeProxy'),
      className: 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200',
    };
  }
  return {
    label: t('imageAnalysisStatus.badgeReady'),
    className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  };
}

function getToggleSummary(
  t: (key: string, options?: Record<string, unknown>) => string,
  status: ImageAnalysisStatus,
  target: CliTarget
): string {
  if (status.nativeReadPreference) {
    if (status.profileModel && status.nativeImageCapable) {
      return t('imageAnalysisStatus.toggleSummaryNativeCapable', { model: status.profileModel });
    }
    if (status.profileModel) {
      return t('imageAnalysisStatus.toggleSummaryNativeModel', { model: status.profileModel });
    }
    return t('imageAnalysisStatus.toggleSummaryNativeDefault');
  }

  if (!status.backendDisplayName && target === 'claude') {
    return t('imageAnalysisStatus.toggleSummaryNativeFileAccess');
  }

  if (!status.backendDisplayName) {
    return t('imageAnalysisStatus.toggleSummaryInactiveTarget', {
      target: t(`imageAnalysisStatus.targetLabel.${target}`),
    });
  }

  const modelSuffix = status.model ? ` · ${status.model}` : '';
  return t('imageAnalysisStatus.toggleSummaryTransformerRoute', {
    backend: status.backendDisplayName,
    modelSuffix,
  });
}

function getExceptionalNote(
  t: (key: string, options?: Record<string, unknown>) => string,
  status: ImageAnalysisStatus,
  target: CliTarget
): string | null {
  if (status.status === 'disabled') {
    return t('imageAnalysisStatus.noteDisabledGlobally');
  }
  if (target !== 'claude') {
    return t('imageAnalysisStatus.noteTargetBypassesHook', {
      target: t(`imageAnalysisStatus.targetLabel.${target}`),
    });
  }
  if (status.nativeReadPreference) {
    return status.nativeImageCapable === true ? null : status.nativeImageReason;
  }
  if (status.status === 'hook-missing') {
    return t('imageAnalysisStatus.notePersistHook');
  }
  if (status.authReadiness === 'missing') {
    return status.authReason;
  }
  if (status.proxyReadiness === 'unavailable') {
    return status.proxyReason;
  }
  return null;
}

export function ImageAnalysisStatusSection({
  status,
  target = 'claude',
  source = 'saved',
  previewState = 'saved',
  nativeReadPreferenceOverride,
  onToggleNativeRead,
}: ImageAnalysisStatusSectionProps) {
  const { t } = useTranslation();

  if (!status) {
    return (
      <div className="rounded-2xl border bg-muted/20 px-4 py-3" aria-live="polite">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-3 w-52 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const nativeReadChecked = nativeReadPreferenceOverride ?? status.nativeReadPreference;
  const effectiveStatus = { ...status, nativeReadPreference: nativeReadChecked };
  const headerBadge = getHeaderBadge(t, effectiveStatus, target);
  const note = getExceptionalNote(t, effectiveStatus, target);
  const capabilityLabel = status.nativeImageCapable
    ? t('imageAnalysisStatus.capabilityVerified')
    : status.profileModel
      ? t('imageAnalysisStatus.capabilityUnknown')
      : null;

  return (
    <section className="rounded-2xl border bg-background/95 px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300">
              <ImageIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">{t('imageAnalysisStatus.sectionTitle')}</h3>
                <Badge className={cn('h-5 border px-1.5 text-[10px]', headerBadge.className)}>
                  {headerBadge.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {getPreviewLabel(t, source, previewState)} ·{' '}
                {getHeaderLabel(t, effectiveStatus, target)}
              </p>
            </div>
          </div>
        </div>

        <Button size="sm" variant="outline" className="h-8 shrink-0" asChild>
          <Link to="/settings?tab=image">
            {t('imageAnalysisStatus.openSettings')}
            <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      <div className="mt-3 rounded-xl border bg-muted/15 px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-medium text-foreground">
                {t('imageAnalysisStatus.useNativeImageReading')}
              </div>
              {capabilityLabel && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  {capabilityLabel}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {getToggleSummary(t, effectiveStatus, target)}
            </p>
          </div>

          <Switch
            checked={nativeReadChecked}
            onCheckedChange={onToggleNativeRead}
            disabled={!onToggleNativeRead}
            aria-label={t('imageAnalysisStatus.useNativeImageReading')}
          />
        </div>
      </div>

      {note && (
        <div className="mt-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
          {note}
        </div>
      )}
    </section>
  );
}
