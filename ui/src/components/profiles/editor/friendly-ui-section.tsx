/**
 * Friendly UI Section
 * Left column with environment variables and info tabs
 * Enhanced with OpenRouter-specific streamlined UI when applicable
 */

import { useMemo, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { EnvEditorSection } from './env-editor-section';
import { InfoSection } from './info-section';
import { OpenRouterModelPicker } from '@/components/profiles/openrouter-model-picker';
import { ModelTierMapping, type TierMapping } from '@/components/profiles/model-tier-mapping';
import { Label } from '@/components/ui/label';
import { MaskedInput } from '@/components/ui/masked-input';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChevronRight, Settings2, Plus } from 'lucide-react';
import { isOpenRouterProfile, extractTierMapping, applyTierMapping } from './utils';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import i18n from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import type { Settings, SettingsResponse } from './types';
import type { CliTarget } from '@/lib/api-client';

interface FriendlyUISectionProps {
  profileName: string;
  target: CliTarget;
  data: SettingsResponse | undefined;
  currentSettings: Settings | undefined;
  newEnvKey: string;
  newEnvValue: string;
  onNewEnvKeyChange: (key: string) => void;
  onNewEnvValueChange: (value: string) => void;
  onEnvValueChange: (key: string, value: string) => void;
  onAddEnvVar: () => void;
  onEnvBulkChange?: (env: Record<string, string>) => void;
}

export function FriendlyUISection({
  profileName,
  target,
  data,
  currentSettings,
  newEnvKey,
  newEnvValue,
  onNewEnvKeyChange,
  onNewEnvValueChange,
  onEnvValueChange,
  onAddEnvVar,
  onEnvBulkChange,
}: FriendlyUISectionProps) {
  const { t } = useTranslation();
  const isOpenRouter = isOpenRouterProfile(currentSettings);
  const settingsEnv = currentSettings?.env;

  // Derive tier mapping from env vars (no local state to sync)
  const tierMapping = useMemo<TierMapping>(
    () => extractTierMapping(settingsEnv ?? {}),
    [settingsEnv]
  );

  // Memoize currentEnv for consistent reference
  const currentEnv = settingsEnv ?? {};

  // Handle model selection from OpenRouter picker - applies to ALL tiers
  const handleModelChange = (modelId: string) => {
    if (onEnvBulkChange) {
      // Update all 4 model tiers at once
      const newEnv = {
        ...currentEnv,
        ANTHROPIC_MODEL: modelId,
        ANTHROPIC_DEFAULT_OPUS_MODEL: modelId,
        ANTHROPIC_DEFAULT_SONNET_MODEL: modelId,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: modelId,
      };
      onEnvBulkChange(newEnv);
    } else {
      // Fallback: update one by one
      onEnvValueChange('ANTHROPIC_MODEL', modelId);
      onEnvValueChange('ANTHROPIC_DEFAULT_OPUS_MODEL', modelId);
      onEnvValueChange('ANTHROPIC_DEFAULT_SONNET_MODEL', modelId);
      onEnvValueChange('ANTHROPIC_DEFAULT_HAIKU_MODEL', modelId);
    }
    // Show feedback toast
    toast.success(i18n.t('commonToast.appliedModelAllTiers'), { duration: 2000 });
  };

  // Handle tier mapping change
  const handleTierMappingChange = (mapping: TierMapping) => {
    // Apply tier mapping to env vars
    if (onEnvBulkChange) {
      const newEnv = applyTierMapping(currentEnv, mapping);
      onEnvBulkChange(newEnv);
    } else {
      // Fallback: update one by one
      if (mapping.opus !== undefined) {
        onEnvValueChange('ANTHROPIC_DEFAULT_OPUS_MODEL', mapping.opus || '');
      }
      if (mapping.sonnet !== undefined) {
        onEnvValueChange('ANTHROPIC_DEFAULT_SONNET_MODEL', mapping.sonnet || '');
      }
      if (mapping.haiku !== undefined) {
        onEnvValueChange('ANTHROPIC_DEFAULT_HAIKU_MODEL', mapping.haiku || '');
      }
    }
  };

  // State for collapsible sections
  const [showAllEnvVars, setShowAllEnvVars] = useState(false);

  // For OpenRouter: only hide API key (has dedicated input above)
  // Show all other env vars in "Additional Variables" section
  const openRouterManagedKeys = new Set([
    'ANTHROPIC_AUTH_TOKEN', // Managed by API Key section
  ]);

  // Get non-managed env vars for display in "Additional Variables"
  const unmanagedEnvVars = Object.entries(currentEnv).filter(
    ([key]) => !openRouterManagedKeys.has(key)
  );

  return (
    <div className="h-full w-full min-w-0 flex flex-col">
      <Tabs defaultValue="env" className="h-full w-full min-w-0 flex flex-col">
        <div className="px-4 pt-4 shrink-0">
          <TabsList className="w-full">
            {/* TODO i18n: missing key for "Configuration" tab label */}
            <TabsTrigger value="env" className="flex-1">
              {isOpenRouter ? 'Configuration' : t('settingsDialog.envTab')}
            </TabsTrigger>
            {/* TODO i18n: missing key for "Info & Usage" tab label */}
            <TabsTrigger value="info" className="flex-1">
              Info &amp; Usage
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col min-w-0">
          <TabsContent
            value="env"
            className="flex-1 mt-0 border-0 p-0 data-[state=inactive]:hidden flex flex-col overflow-hidden min-w-0"
          >
            {/* OpenRouter Streamlined View */}
            {isOpenRouter ? (
              <>
                <div className="flex-1 overflow-hidden">
                  <div className="h-full overflow-y-auto overflow-x-hidden p-4 space-y-6">
                    {/* Model Selection - Primary Focus */}
                    <div className="space-y-3">
                      {/* TODO i18n: missing key for "Model Selection" label */}
                      <Label className="text-sm font-medium">Model Selection</Label>
                      <OpenRouterModelPicker
                        value={currentEnv.ANTHROPIC_MODEL}
                        onChange={handleModelChange}
                        placeholder="Search OpenRouter models..."
                      />
                    </div>

                    {/* Model Tier Mapping - Collapsible */}
                    <ModelTierMapping
                      selectedModel={currentEnv.ANTHROPIC_MODEL}
                      value={tierMapping}
                      onChange={handleTierMappingChange}
                    />

                    {/* API Key */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">{t('profileDialog.apiKey')}</Label>
                      <MaskedInput
                        value={currentEnv.ANTHROPIC_AUTH_TOKEN || ''}
                        onChange={(e) => onEnvValueChange('ANTHROPIC_AUTH_TOKEN', e.target.value)}
                        placeholder="sk-or-v1-..."
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Get your API key from{' '}
                        <a
                          href="https://openrouter.ai/keys"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          openrouter.ai/keys
                        </a>
                      </p>
                    </div>

                    {/* Additional Environment Variables (non-managed) */}
                    {unmanagedEnvVars.length > 0 && (
                      <Collapsible open={showAllEnvVars} onOpenChange={setShowAllEnvVars}>
                        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group">
                          <ChevronRight
                            className={cn(
                              'h-4 w-4 transition-transform',
                              showAllEnvVars && 'rotate-90'
                            )}
                          />
                          <Settings2 className="h-4 w-4" />
                          {/* TODO i18n: missing key for "Additional Variables" label */}
                          <span>Additional Variables</span>
                          <span className="text-xs font-normal opacity-70">
                            ({unmanagedEnvVars.length})
                          </span>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-4">
                          <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
                            {unmanagedEnvVars.map(([key, value]) => (
                              <div key={key} className="space-y-1">
                                <Label className="text-xs text-muted-foreground">{key}</Label>
                                <Input
                                  value={value}
                                  onChange={(e) => onEnvValueChange(key, e.target.value)}
                                  className="font-mono text-xs h-8"
                                />
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                </div>

                {/* Fixed Add Variable Input at Bottom */}
                <div className="p-4 border-t bg-background shrink-0">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {t('envEditor.addVariable')}
                  </Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      placeholder={t('envEditor.keyPlaceholder')}
                      value={newEnvKey}
                      onChange={(e) => onNewEnvKeyChange(e.target.value.toUpperCase())}
                      className="font-mono text-sm h-8 w-2/5"
                      onKeyDown={(e) => e.key === 'Enter' && newEnvKey.trim() && onAddEnvVar()}
                    />
                    <Input
                      placeholder={t('envEditor.valuePlaceholder')}
                      value={newEnvValue}
                      onChange={(e) => onNewEnvValueChange(e.target.value)}
                      className="font-mono text-sm h-8 flex-1"
                      onKeyDown={(e) => e.key === 'Enter' && newEnvKey.trim() && onAddEnvVar()}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={onAddEnvVar}
                      disabled={!newEnvKey.trim()}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              /* Standard Env Editor for non-OpenRouter profiles */
              <EnvEditorSection
                currentSettings={currentSettings}
                newEnvKey={newEnvKey}
                newEnvValue={newEnvValue}
                onNewEnvKeyChange={onNewEnvKeyChange}
                onNewEnvValueChange={onNewEnvValueChange}
                onEnvValueChange={onEnvValueChange}
                onAddEnvVar={onAddEnvVar}
              />
            )}
          </TabsContent>

          <TabsContent
            value="info"
            className="h-full mt-0 border-0 p-0 data-[state=inactive]:hidden"
          >
            <InfoSection profileName={profileName} target={target} data={data} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
