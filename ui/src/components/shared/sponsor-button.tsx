/**
 * Sponsor Button
 *
 * GitHub Sponsors button for navbar.
 * Heart icon with hover animation.
 */

import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

const SPONSOR_URL = 'https://github.com/sponsors/kaitranntt';

export function SponsorButton() {
  const { t } = useTranslation();

  return (
    <a
      href={SPONSOR_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg',
        'bg-pink-500/10 border-2 border-pink-500/40',
        'hover:bg-pink-400 hover:border-pink-400',
        'transition-all duration-200 shadow-sm hover:shadow-md'
      )}
      title={t('sponsorButton.title')}
    >
      <Heart
        className={cn(
          'w-4 h-4 text-pink-500',
          'group-hover:text-white group-hover:fill-white',
          'group-hover:animate-pulse',
          'transition-colors'
        )}
      />
      <span
        className={cn(
          'text-xs font-bold text-pink-600 dark:text-pink-300',
          'group-hover:text-white dark:group-hover:text-white',
          'transition-colors'
        )}
      >
        {t('sponsorButton.sponsor')}
      </span>
    </a>
  );
}
