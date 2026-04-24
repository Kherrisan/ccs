import { useCallback } from 'react';
import { api } from '@/lib/api-client';
import { useSettingsActions, useSettingsContext } from './context-hooks';
import type { BrowserConfig, BrowserSavePayload } from '../types';

function mergeConfig(current: BrowserConfig, updates: BrowserSavePayload): BrowserConfig {
  return {
    claude: {
      ...current.claude,
      ...updates.claude,
    },
    codex: {
      ...current.codex,
      ...updates.codex,
    },
  };
}

export function useBrowserConfig() {
  const { state } = useSettingsContext();
  const actions = useSettingsActions();

  const fetchConfig = useCallback(async () => {
    try {
      actions.setBrowserLoading(true);
      actions.setBrowserError(null);
      const payload = await api.browser.get();
      actions.setBrowserConfig(payload.config);
      actions.setBrowserStatus(payload.status);
    } catch (err) {
      actions.setBrowserError((err as Error).message);
    } finally {
      actions.setBrowserLoading(false);
      actions.setBrowserStatusLoading(false);
    }
  }, [actions]);

  const fetchStatus = useCallback(async () => {
    try {
      actions.setBrowserStatusLoading(true);
      actions.setBrowserError(null);
      const status = await api.browser.getStatus();
      actions.setBrowserStatus(status);
      return status;
    } catch (err) {
      actions.setBrowserError((err as Error).message);
      return null;
    } finally {
      actions.setBrowserStatusLoading(false);
    }
  }, [actions]);

  const saveConfig = useCallback(
    async (updates: BrowserSavePayload) => {
      const currentConfig = state.browserConfig;
      if (!currentConfig) return false;

      const optimisticConfig = mergeConfig(currentConfig, updates);
      actions.setBrowserConfig(optimisticConfig);

      try {
        actions.setBrowserSaving(true);
        actions.setBrowserError(null);
        const response = await api.browser.update(updates);
        actions.setBrowserConfig(response.browser.config);
        actions.setBrowserStatus(response.browser.status);
        actions.setBrowserSuccess(true);
        window.setTimeout(() => actions.setBrowserSuccess(false), 1500);
        return true;
      } catch (err) {
        actions.setBrowserConfig(currentConfig);
        actions.setBrowserError((err as Error).message);
        return false;
      } finally {
        actions.setBrowserSaving(false);
      }
    },
    [actions, state.browserConfig]
  );

  return {
    config: state.browserConfig,
    status: state.browserStatus,
    loading: state.browserLoading,
    statusLoading: state.browserStatusLoading,
    saving: state.browserSaving,
    error: state.browserError,
    success: state.browserSuccess,
    fetchConfig,
    fetchStatus,
    saveConfig,
  };
}
