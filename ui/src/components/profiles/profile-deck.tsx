import { useProfiles } from '@/hooks/use-profiles';
import { ProfileCard } from './profile-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from 'react-i18next';

export function ProfileDeck() {
  const { t } = useTranslation();
  const { data: response, isLoading, error } = useProfiles();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-32 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive text-sm">
        {t('apiProfiles.failedLoadTitle')}: {error.message}
      </div>
    );
  }

  const profiles = response?.profiles || [];

  if (!profiles || profiles.length === 0) {
    return (
      <div className="text-muted-foreground text-center py-8">
        {t('apiProfiles.noProfilesDesc')}
      </div>
    );
  }

  // Use real profile data directly
  const normalizedProfiles = profiles.map((profile) => ({
    ...profile,
    configured: profile.configured ?? false, // Ensure configured is always boolean
  }));

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('profileDeck.profiles')}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {normalizedProfiles.map((profile) => (
          <ProfileCard
            key={profile.name}
            profile={profile}
            onSwitch={() => console.log('Switch to', profile.name)}
            onConfig={() => console.log('Config', profile.name)}
            onTest={() => console.log('Test', profile.name)}
          />
        ))}
      </div>
    </div>
  );
}
