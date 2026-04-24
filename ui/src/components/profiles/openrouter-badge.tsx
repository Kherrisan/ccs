/**
 * OpenRouter Badge Component
 * Visual indicator for OpenRouter-configured profiles
 */

import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface OpenRouterBadgeProps {
  className?: string;
  showTooltip?: boolean;
}

export function OpenRouterBadge({ className, showTooltip = true }: OpenRouterBadgeProps) {
  const { t } = useTranslation();

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        'bg-accent/10 border-accent/30 text-accent',
        'dark:bg-accent/20 dark:border-accent/40 dark:text-accent-foreground',
        className
      )}
    >
      <img src="/icons/openrouter.svg" alt="OpenRouter" className="mr-1 h-3 w-3" />
      OpenRouter
    </Badge>
  );

  if (!showTooltip) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>
        <p>{t('openrouterBadge.integration')}</p>
      </TooltipContent>
    </Tooltip>
  );
}
