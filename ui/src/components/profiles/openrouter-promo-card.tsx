/**
 * OpenRouter Promo Card
 * Permanent promotional card for OpenRouter - always visible in sidebar footer
 */

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useOpenRouterReady } from '@/hooks/use-openrouter-models';
import { Zap } from 'lucide-react';

interface OpenRouterPromoCardProps {
  onCreateClick: () => void;
}

export function OpenRouterPromoCard({ onCreateClick }: OpenRouterPromoCardProps) {
  const { t } = useTranslation();
  useOpenRouterReady();

  return (
    <div className="p-3 border-t bg-gradient-to-r from-accent/5 to-accent/10 dark:from-accent/10 dark:to-accent/15">
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-accent/10 dark:bg-accent/20 rounded shrink-0">
          <img src="/icons/openrouter.svg" alt="" className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-accent dark:text-accent-foreground">
            {t('openrouterPromoCard.title')}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {t('openrouterPromoCard.description')}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onCreateClick}
          className="h-7 px-2 text-accent hover:text-accent hover:bg-accent/10 dark:hover:bg-accent/20"
        >
          <Zap className="w-3 h-3 mr-1" />
          <span className="text-xs">{t('openrouterBanner.add')}</span>
        </Button>
      </div>
    </div>
  );
}
