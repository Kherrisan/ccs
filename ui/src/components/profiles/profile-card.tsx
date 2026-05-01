import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SettingsIcon, PlayIcon } from 'lucide-react';
import { isOpenRouterProfile } from './editor/utils';
import type { Settings } from './editor/types';

interface ProfileCardProps {
  profile: {
    name: string;
    settingsPath: string;
    configured: boolean;
    isActive?: boolean;
    lastUsed?: string;
    model?: string;
  };
  /** Optional settings for OpenRouter detection */
  settings?: Settings;
  onSwitch?: () => void;
  onConfig?: () => void;
  onTest?: () => void;
}

export function ProfileCard({ profile, settings, onSwitch, onConfig, onTest }: ProfileCardProps) {
  const { t } = useTranslation();
  const showOpenRouterIcon = isOpenRouterProfile(settings);

  return (
    <Card className={profile.isActive ? 'border-primary' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{profile.name}</h3>
            {showOpenRouterIcon && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <img src="/icons/openrouter.svg" alt="OpenRouter" className="w-4 h-4" />
                </TooltipTrigger>
                <TooltipContent>{t('profileCard.openRouter')}</TooltipContent>
              </Tooltip>
            )}
            {profile.isActive && (
              <Badge variant="default" className="text-xs">
                Active
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onSwitch} disabled={profile.isActive}>
            {profile.isActive ? 'Active' : 'Switch'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {profile.model && (
          <div className="text-sm text-muted-foreground">Model: {profile.model}</div>
        )}
        {profile.lastUsed && (
          <div className="text-sm text-muted-foreground">Last used: {profile.lastUsed}</div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onConfig} className="flex-1">
            <SettingsIcon className="w-4 h-4 mr-1" />
            Config
          </Button>
          <Button variant="outline" size="sm" onClick={onTest} className="flex-1">
            <PlayIcon className="w-4 h-4 mr-1" />
            Test
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
