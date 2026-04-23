/**
 * Thinking Section
 * Settings section for thinking budget configuration
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RefreshCw, CheckCircle2, AlertCircle, Brain, Info, ChevronDown } from 'lucide-react';
import { useThinkingConfig } from '../../hooks';
import type { ThinkingMode } from '../../types';
import { useTranslation } from 'react-i18next';

// Thinking level labels are technical descriptors with token counts that stay
// consistent across locales. If locale-specific labels are needed later, add
// i18n keys and replace these with t() calls.
// TODO i18n: missing key for thinking level labels
const THINKING_LEVELS = [
  { value: 'minimal', label: 'Minimal (512 tokens)' },
  { value: 'low', label: 'Low (1K tokens)' },
  { value: 'medium', label: 'Medium (8K tokens)' },
  { value: 'high', label: 'High (24K tokens)' },
  { value: 'xhigh', label: 'Extra High (32K tokens)' },
  { value: 'max', label: 'Max (adaptive ceiling)' },
  { value: 'auto', label: 'Auto (dynamic)' },
];

// TODO i18n: missing key for override level labels
const OVERRIDE_LEVELS = [
  { value: '__none__', label: 'None (use CLI flags only)' },
  ...THINKING_LEVELS,
  { value: '__custom__', label: 'Custom budget (number)' },
  { value: 'off', label: 'Off (disable thinking)' },
];

const DEFAULT_PROVIDER_KEYS = ['agy', 'gemini', 'codex'];
const THINKING_BUDGET_MIN = 0;
const THINKING_BUDGET_MAX = 100000;

export default function ThinkingSection() {
  const { t } = useTranslation();
  const {
    config,
    loading,
    saving,
    error,
    success,
    fetchConfig,
    setMode,
    setTierDefault,
    setShowWarnings,
    setOverride,
    setProviderOverride,
  } = useThinkingConfig();
  const [providerOverridesOpenOverride, setProviderOverridesOpenOverride] = useState<
    boolean | null
  >(null);
  const [customProviderInput, setCustomProviderInput] = useState('');
  const [addedProviders, setAddedProviders] = useState<string[]>([]);
  const [customOverrideBudgetInput, setCustomOverrideBudgetInput] = useState<string | null>(null);

  const providerKeys = useMemo(
    () =>
      Array.from(
        new Set([
          ...DEFAULT_PROVIDER_KEYS,
          ...Object.keys(config.provider_overrides ?? {}),
          ...addedProviders,
        ])
      ),
    [addedProviders, config.provider_overrides]
  );

  const overrideSelectValue =
    config.override === undefined
      ? '__none__'
      : typeof config.override === 'number' || /^\d+$/.test(String(config.override))
        ? '__custom__'
        : String(config.override);
  const persistedCustomOverrideBudget =
    typeof config.override === 'number' || /^\d+$/.test(String(config.override ?? ''))
      ? String(config.override)
      : '';
  const customOverrideBudget = customOverrideBudgetInput ?? persistedCustomOverrideBudget;
  const hasProviderOverrides = Object.keys(config.provider_overrides ?? {}).length > 0;
  const providerOverridesOpen = providerOverridesOpenOverride ?? hasProviderOverrides;

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleAddProvider = () => {
    const normalized = customProviderInput.trim().toLowerCase();
    if (!normalized) return;
    if (!providerKeys.includes(normalized)) {
      setAddedProviders((prev) => [...prev, normalized]);
    }
    setCustomProviderInput('');
    setProviderOverridesOpenOverride(true);
  };

  const handleApplyCustomBudget = () => {
    const trimmed = customOverrideBudget.trim();
    if (!trimmed) {
      setOverride(undefined);
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (
      Number.isNaN(parsed) ||
      parsed < THINKING_BUDGET_MIN ||
      parsed > THINKING_BUDGET_MAX ||
      !/^\d+$/.test(trimmed)
    ) {
      return;
    }
    setOverride(parsed);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>{t('settings.loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Toast-style alerts */}
      <div
        className={`absolute left-5 right-5 top-20 z-10 transition-all duration-200 ease-out ${
          error || success
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-2 pointer-events-none'
        }`}
      >
        {error && (
          <Alert variant="destructive" className="py-2 shadow-lg">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </div>
              {/* W1: Retry button on error */}
              <Button
                variant="outline"
                size="sm"
                onClick={fetchConfig}
                className="h-7 px-2 text-xs border-destructive/50 hover:bg-destructive/10"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                {t('sharedPage.retry')}
              </Button>
            </div>
          </Alert>
        )}
        {success && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-green-200 bg-green-50 text-green-700 shadow-lg dark:border-green-900/50 dark:bg-green-900/90 dark:text-green-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">{t('settings.saved')}</span>
          </div>
        )}
      </div>

      {/* Scrollable Content */}
      <ScrollArea className="flex-1">
        <div className="p-5 space-y-6">
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5 text-primary" />
            <p className="text-sm text-muted-foreground">{t('settingsThinking.description')}</p>
          </div>

          {/* U4: Provider support indicator */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-700 dark:text-blue-300">
              <p className="font-medium">{t('settingsThinking.supportedProviders')}</p>
              <ul className="mt-1 space-y-0.5 text-blue-600 dark:text-blue-400">
                <li>
                  {t('settingsThinking.supportLine1Prefix')} <strong>agy</strong>,{' '}
                  <strong>gemini</strong> {t('settingsThinking.supportLine1Suffix')}
                </li>
                <li>
                  {t('settingsThinking.supportLine2Prefix')} <strong>codex</strong>{' '}
                  {t('settingsThinking.supportLine2SuffixPrefix')}
                  <code>--effort</code>
                  {t('settingsThinking.supportLine2SuffixPostfix')}
                </li>
                <li>
                  {t('settingsThinking.supportLine3Prefix')} <code>-high</code>
                  {t('settingsThinking.supportLine3Suffix')}
                </li>
              </ul>
            </div>
          </div>

          {/* Mode Selection */}
          <div className="space-y-3">
            <h3 className="text-base font-medium">{t('settingsThinking.modeTitle')}</h3>
            <div className="space-y-2">
              {(['auto', 'off', 'manual'] as ThinkingMode[]).map((mode) => (
                <div
                  key={mode}
                  className={`flex items-center justify-between p-4 rounded-lg cursor-pointer transition-colors ${
                    config.mode === mode
                      ? 'bg-primary/10 border border-primary/30'
                      : 'bg-muted/50 hover:bg-muted/80'
                  } ${saving ? 'opacity-70 pointer-events-none' : ''}`}
                  onClick={() => {
                    if (!saving) {
                      setMode(mode);
                    }
                  }}
                >
                  <div>
                    <p className="font-medium capitalize">{mode}</p>
                    <p className="text-sm text-muted-foreground">
                      {mode === 'auto' && t('settingsThinking.modeAutoDesc')}
                      {mode === 'off' && t('settingsThinking.modeOffDesc')}
                      {mode === 'manual' && t('settingsThinking.modeManualDesc')}
                    </p>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-full border-2 ${
                      config.mode === mode
                        ? 'bg-primary border-primary'
                        : 'border-muted-foreground/50'
                    }`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Tier Defaults (only shown when mode is auto) */}
          {config.mode === 'auto' && (
            <div className="space-y-3">
              <h3 className="text-base font-medium">{t('settingsThinking.tierDefaults')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('settingsThinking.tierDefaultsDesc')}
              </p>

              <div className="space-y-3">
                {(['opus', 'sonnet', 'haiku'] as const).map((tier) => (
                  <div key={tier} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
                    <Label className="w-20 capitalize font-medium">{tier}</Label>
                    <Select
                      value={config.tier_defaults[tier]}
                      onValueChange={(value) => setTierDefault(tier, value)}
                      disabled={saving}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {THINKING_LEVELS.map((level) => (
                          <SelectItem key={level.value} value={level.value}>
                            {level.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manual Override (shown when mode is manual) */}
          {config.mode === 'manual' && (
            <div className="space-y-3">
              <h3 className="text-base font-medium">{t('settingsThinking.persistentOverride')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('settingsThinking.persistentOverrideDesc')}
              </p>
              <Select
                value={overrideSelectValue}
                onValueChange={(value) => {
                  if (value === '__none__') {
                    setOverride(undefined);
                    return;
                  }
                  if (value === '__custom__') {
                    if (!customOverrideBudget) {
                      setCustomOverrideBudgetInput('8192');
                    }
                    return;
                  }
                  setCustomOverrideBudgetInput(null);
                  setOverride(value);
                }}
                disabled={saving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OVERRIDE_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {overrideSelectValue === '__custom__' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={THINKING_BUDGET_MIN}
                      max={THINKING_BUDGET_MAX}
                      value={customOverrideBudget}
                      onChange={(event) => setCustomOverrideBudgetInput(event.target.value)}
                      onBlur={handleApplyCustomBudget}
                      disabled={saving}
                      placeholder={t('settingsThinking.enterCustomBudget')}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleApplyCustomBudget}
                      disabled={saving}
                    >
                      {t('settingsThinking.apply')}
                    </Button>
                  </div>
                  {/* TODO i18n: missing key for budget range text */}
                  <p className="text-xs text-muted-foreground">
                    Range: {THINKING_BUDGET_MIN} to {THINKING_BUDGET_MAX}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Provider Overrides (collapsible) */}
          <div className="space-y-3">
            <button
              type="button"
              className="flex items-center gap-2 text-base font-medium w-full text-left"
              onClick={() =>
                setProviderOverridesOpenOverride((prev) => !(prev ?? hasProviderOverrides))
              }
              disabled={saving}
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform ${providerOverridesOpen ? 'rotate-0' : '-rotate-90'}`}
              />
              {t('settingsThinking.providerOverrides', {
                count: Object.keys(config.provider_overrides ?? {}).length,
              })}
            </button>
            {providerOverridesOpen && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t('settingsThinking.providerOverridesDesc')}
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    value={customProviderInput}
                    onChange={(event) => setCustomProviderInput(event.target.value)}
                    disabled={saving}
                    placeholder={t('settingsThinking.addProviderPlaceholder')}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAddProvider}
                    disabled={saving}
                  >
                    {t('settingsGlobalEnv.add')}
                  </Button>
                </div>
                {providerKeys.map((provider) => (
                  <div key={provider} className="space-y-2 p-3 rounded-lg bg-muted/30">
                    <Label className="capitalize font-medium text-sm">{provider}</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['opus', 'sonnet', 'haiku'] as const).map((tier) => {
                        const currentValue =
                          config.provider_overrides?.[provider]?.[tier] || '__default__';
                        return (
                          <div key={tier} className="space-y-1">
                            <Label className="text-xs text-muted-foreground capitalize">
                              {tier}
                            </Label>
                            <Select
                              value={currentValue}
                              onValueChange={(value) =>
                                setProviderOverride(
                                  provider,
                                  tier,
                                  value === '__default__' ? undefined : value
                                )
                              }
                              disabled={saving}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__default__">
                                  {t('cursorPage.default')}
                                </SelectItem>
                                {THINKING_LEVELS.map((level) => (
                                  <SelectItem key={level.value} value={level.value}>
                                    {level.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Show Warnings Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div>
              <p className="font-medium">{t('settingsThinking.showWarnings')}</p>
              <p className="text-sm text-muted-foreground">
                {t('settingsThinking.showWarningsDesc')}
              </p>
            </div>
            <Switch
              checked={config.show_warnings ?? true}
              onCheckedChange={setShowWarnings}
              disabled={saving}
            />
          </div>

          {/* Info Box */}
          <div className="p-4 rounded-lg border bg-muted/30">
            <h4 className="text-sm font-medium mb-2">{t('settingsThinking.cliEnvOverride')}</h4>
            {/* TODO i18n: missing key for CLI/env override info text */}
            <p className="text-sm text-muted-foreground mb-2">
              Override per session with flags or{' '}
              <code className="px-1.5 py-0.5 rounded bg-muted">CCS_THINKING</code> env var.
              Priority: flag &gt; env &gt; config.
            </p>
            <div className="space-y-1 text-sm font-mono text-muted-foreground">
              <p>ccs gemini --thinking high</p>
              <p>ccs codex --effort xhigh</p>
              <p>CCS_THINKING=high ccs codex &quot;debug this&quot;</p>
              <p>ccs config thinking --mode auto</p>
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t bg-background">
        <Button
          variant="outline"
          size="sm"
          onClick={fetchConfig}
          disabled={loading || saving}
          className="w-full"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {t('settings.refresh')}
        </Button>
      </div>
    </>
  );
}
