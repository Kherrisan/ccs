/**
 * ClaudeKit Badge Button
 *
 * "Powered by ClaudeKit" badge for navbar, inspired by landing page design.
 * Compact version optimized for header placement.
 */

import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

const CLAUDEKIT_URL = 'https://claudekit.cc?ref=HMNKXOHN';

export function ClaudeKitBadge() {
  const { t } = useTranslation();

  return (
    <a
      href={CLAUDEKIT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg',
        'bg-accent/10 border-2 border-accent/40',
        'hover:bg-accent hover:border-accent',
        'transition-all duration-200 shadow-sm hover:shadow-md'
      )}
      title={t('claudekitBadge.title')}
    >
      <img src="/logos/claudekit-logo.png" alt={t('claudekitBadge.alt')} className="w-5 h-5" />
      <span className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span
          className={cn(
            'text-[10px] font-medium uppercase tracking-wide',
            'text-muted-foreground group-hover:text-accent-foreground/80',
            'transition-colors'
          )}
        >
          {t('claudekitBadge.poweredBy')}
        </span>
        <span
          className={cn(
            'text-xs font-bold text-foreground',
            'group-hover:text-accent-foreground',
            'transition-colors'
          )}
        >
          {t('claudekitBadge.claudekit')}
        </span>
      </span>
    </a>
  );
}
