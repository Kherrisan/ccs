/**
 * OpenRouter Feature Banner
 * Dismissible announcement banner for OpenRouter integration
 */

/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Sparkles, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOpenRouterReady } from '@/hooks/use-openrouter-models';

const BANNER_DISMISSED_KEY = 'ccs:openrouter-banner-dismissed';

interface OpenRouterBannerProps {
  onCreateClick?: () => void;
}

export function OpenRouterBanner({ onCreateClick }: OpenRouterBannerProps) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(true); // Start hidden to avoid flash
  const { modelCount, isLoading } = useOpenRouterReady();

  // Check localStorage on mount
  useEffect(() => {
    const isDismissed = localStorage.getItem(BANNER_DISMISSED_KEY) === 'true';
    setDismissed(isDismissed);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <div className="bg-gradient-to-r from-accent to-accent/90 text-white px-4 py-3 relative shrink-0">
      <div className="flex items-center justify-between gap-4 max-w-screen-xl mx-auto">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-1.5 bg-white/20 rounded-md shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">
              {t('openrouterBadge.new')}: {t('openrouterBadge.integration')}
            </p>
            <p className="text-xs text-white/80 truncate">
              {t('openrouterBanner.accessModels', {
                count: isLoading ? 300 : modelCount,
              })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onCreateClick && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onCreateClick}
              className="bg-white text-accent hover:bg-white/90 h-8"
            >
              {t('openrouterBanner.add')}
            </Button>
          )}
          <a
            href="https://openrouter.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-white/80 hover:text-white hidden sm:flex items-center gap-1"
          >
            Learn more
            <ExternalLink className="w-3 h-3" />
          </a>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleDismiss}
            className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/20"
          >
            <X className="w-4 h-4" />
            <span className="sr-only">Dismiss</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
