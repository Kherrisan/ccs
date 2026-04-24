/**
 * Thinking Config Hook
 * Manages thinking budget configuration with direct API calls
 * Includes W4 optimistic locking via lastModified timestamps
 *
 * TODO i18n: error messages in this hook cannot use useTranslation
 * (not a React component). Consumer components should wrap displayed messages
 * with t() where possible.
 */

import { useCallback, useState, useRef } from 'react';
import type { ThinkingConfig, ThinkingMode } from '../types';

const DEFAULT_THINKING_CONFIG: ThinkingConfig = {
  mode: 'auto',
  tier_defaults: {
    opus: 'high',
    sonnet: 'medium',
    haiku: 'low',
  },
  show_warnings: true,
};

const FETCH_TIMEOUT = 10000; // 10 second timeout

type ThinkingUpdatePayload = Omit<Partial<ThinkingConfig>, 'override' | 'provider_overrides'> & {
  override?: string | number | null;
  provider_overrides?: Record<string, Partial<ThinkingConfig['tier_defaults']>> | null;
  clear_override?: boolean;
  clear_provider_overrides?: boolean;
};

export function useThinkingConfig() {
  const [config, setConfig] = useState<ThinkingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // W4: Track lastModified for optimistic locking
  const lastModifiedRef = useRef<number | undefined>(undefined);
  const hasLoadedConfigRef = useRef(false);

  const fetchConfig = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/thinking', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) {
        // Handle HTML error pages gracefully
        const contentType = res.headers.get('content-type');
        if (contentType?.includes('text/html')) {
          throw new Error(`Server error (${res.status})`);
        }
        throw new Error('Failed to load Thinking config');
      }
      const data = await res.json();
      setConfig(data.config || DEFAULT_THINKING_CONFIG);
      // W4: Store lastModified for optimistic locking
      lastModifiedRef.current = data.lastModified;
      hasLoadedConfigRef.current = true;
    } catch (err) {
      clearTimeout(timeoutId);
      if ((err as Error).name === 'AbortError') {
        setError('Request timeout - please try again');
      } else {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }

    // Return cleanup function for AbortController
    return () => controller.abort();
  }, []);

  const saveConfig = useCallback(
    async (updates: ThinkingUpdatePayload) => {
      if (!hasLoadedConfigRef.current || config === null) {
        setError('Cannot save settings before they load. Click Refresh and try again.');
        return;
      }

      const currentConfig = config;
      const optimisticConfig: ThinkingConfig = {
        ...currentConfig,
        ...(updates.mode !== undefined ? { mode: updates.mode } : {}),
        ...(updates.tier_defaults !== undefined ? { tier_defaults: updates.tier_defaults } : {}),
        ...(updates.show_warnings !== undefined ? { show_warnings: updates.show_warnings } : {}),
      };

      if (updates.clear_override || updates.override === null) {
        delete optimisticConfig.override;
      } else if (updates.override !== undefined) {
        optimisticConfig.override = updates.override;
      }

      if (updates.clear_provider_overrides || updates.provider_overrides === null) {
        delete optimisticConfig.provider_overrides;
      } else if (updates.provider_overrides !== undefined) {
        optimisticConfig.provider_overrides = updates.provider_overrides;
      }

      setConfig(optimisticConfig);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      try {
        setSaving(true);
        setError(null);

        // W4: Include lastModified for optimistic locking
        const payload = {
          ...optimisticConfig,
          lastModified: lastModifiedRef.current,
        };

        const res = await fetch('/api/thinking', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          // Handle HTML error pages gracefully
          const contentType = res.headers.get('content-type');
          if (contentType?.includes('text/html')) {
            throw new Error(`Server error (${res.status})`);
          }
          const data = await res.json();
          // W4: Handle conflict (409) with user-friendly message
          if (res.status === 409) {
            throw new Error('Config changed by another session. Refreshing...');
          }
          throw new Error(data.error || 'Failed to save');
        }

        const data = await res.json();
        setConfig(data.config);
        // W4: Update lastModified after successful save
        lastModifiedRef.current = data.lastModified;
        setSuccess(true);
        setTimeout(() => setSuccess(false), 1500);
      } catch (err) {
        clearTimeout(timeoutId);
        setConfig(currentConfig);
        if ((err as Error).name === 'AbortError') {
          setError('Request timeout - please try again');
        } else {
          setError((err as Error).message);
          // W4: On conflict, auto-refresh to get latest
          if ((err as Error).message.includes('another session')) {
            setTimeout(() => fetchConfig(), 1000);
          }
        }
      } finally {
        setSaving(false);
      }
    },
    [config, fetchConfig]
  );

  const setMode = useCallback(
    (mode: ThinkingMode) => {
      saveConfig({ mode });
    },
    [saveConfig]
  );

  const setTierDefault = useCallback(
    (tier: 'opus' | 'sonnet' | 'haiku', value: string) => {
      const currentDefaults = config?.tier_defaults || DEFAULT_THINKING_CONFIG.tier_defaults;
      saveConfig({
        tier_defaults: { ...currentDefaults, [tier]: value },
      });
    },
    [config, saveConfig]
  );

  const setShowWarnings = useCallback(
    (show: boolean) => {
      saveConfig({ show_warnings: show });
    },
    [saveConfig]
  );

  const setOverride = useCallback(
    (value: string | number | undefined) => {
      if (value === undefined) {
        saveConfig({ override: null, clear_override: true });
        return;
      }
      saveConfig({ override: value, clear_override: false });
    },
    [saveConfig]
  );

  const setProviderOverride = useCallback(
    (provider: string, tier: 'opus' | 'sonnet' | 'haiku', level: string | undefined) => {
      const currentOverrides = config?.provider_overrides || {};
      const currentProviderOverrides = currentOverrides[provider] || {};

      if (level === undefined) {
        // Remove the tier override
        const { [tier]: _, ...rest } = currentProviderOverrides;
        const updatedProvider = Object.keys(rest).length > 0 ? rest : undefined;
        const { [provider]: __, ...otherProviders } = currentOverrides;
        const updatedOverrides = updatedProvider
          ? { ...otherProviders, [provider]: updatedProvider }
          : otherProviders;
        saveConfig({
          provider_overrides: Object.keys(updatedOverrides).length > 0 ? updatedOverrides : null,
          clear_provider_overrides: Object.keys(updatedOverrides).length === 0,
        });
      } else {
        saveConfig({
          provider_overrides: {
            ...currentOverrides,
            [provider]: { ...currentProviderOverrides, [tier]: level },
          },
          clear_provider_overrides: false,
        });
      }
    },
    [config, saveConfig]
  );

  return {
    config: config || DEFAULT_THINKING_CONFIG,
    loading,
    saving,
    error,
    success,
    fetchConfig,
    saveConfig,
    setMode,
    setTierDefault,
    setShowWarnings,
    setOverride,
    setProviderOverride,
  };
}
