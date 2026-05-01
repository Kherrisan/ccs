/**
 * Profile Editor Hook
 * Query + mutation logic for profile settings
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { Settings, SettingsResponse } from './types';

/** Required env vars for profiles to function (informational only - runtime fills defaults) */
const REQUIRED_ENV_KEYS = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN'] as const;

/** Check settings for missing fields (for UI warnings) */
function checkMissingFields(settings: Settings | undefined): string[] {
  const env = settings?.env || {};
  return REQUIRED_ENV_KEYS.filter((key) => !env[key]?.trim());
}

interface UseProfileEditorOptions {
  profileName: string;
  localEdits: Record<string, string>;
  rawJsonEdits: string | null;
  rawJsonContent: string;
  onSuccess: () => void;
  onConflict: () => void;
}

export function useProfileEditor({
  profileName,
  localEdits,
  rawJsonEdits,
  rawJsonContent,
  onSuccess,
  onConflict,
}: UseProfileEditorOptions) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Fetch settings for selected profile
  const query = useQuery<SettingsResponse>({
    queryKey: ['settings', profileName],
    queryFn: async () => {
      const res = await fetch(`/api/settings/${profileName}/raw`);
      if (!res.ok) {
        throw new Error(`Failed to load settings: ${res.status}`);
      }
      return res.json();
    },
  });

  // Derive current settings by merging original data with local edits
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- Intentional: merge raw JSON edits over query data
  const currentSettings = useMemo((): Settings | undefined => {
    if (rawJsonEdits !== null) {
      try {
        return JSON.parse(rawJsonEdits);
      } catch {
        // If invalid JSON, fall back
      }
    }

    if (!query.data?.settings) return undefined;
    return {
      ...query.data.settings,
      env: {
        ...query.data.settings.env,
        ...localEdits,
      },
    };
  }, [query.data?.settings, localEdits, rawJsonEdits]);

  // Check if raw JSON is valid
  const isRawJsonValid = useMemo(() => {
    try {
      JSON.parse(rawJsonContent);
      return true;
    } catch {
      return false;
    }
  }, [rawJsonContent]);

  // Check if there are unsaved changes
  const hasChanges = useMemo(() => {
    if (rawJsonEdits !== null) {
      return rawJsonEdits !== JSON.stringify(query.data?.settings, null, 2);
    }
    return Object.keys(localEdits).length > 0;
  }, [rawJsonEdits, localEdits, query.data?.settings]);

  // Validation state for missing required fields (informational warning)
  const missingFields = useMemo(() => checkMissingFields(currentSettings), [currentSettings]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      let settingsToSave: Settings;

      try {
        settingsToSave = JSON.parse(rawJsonContent);
      } catch {
        settingsToSave = {
          ...query.data?.settings,
          env: {
            ...query.data?.settings?.env,
            ...localEdits,
          },
        };
      }

      const res = await fetch(`/api/settings/${profileName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: settingsToSave,
          expectedMtime: query.data?.mtime,
        }),
      });

      if (res.status === 409) {
        throw new Error('CONFLICT');
      }

      if (!res.ok) {
        throw new Error('Failed to save');
      }

      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settings', profileName] });
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      onSuccess();
      // Show warning if fields missing (runtime uses defaults)
      if (data?.warning) {
        toast.success(t('commonToast.settingsSaved'), {
          description: data.warning,
        });
      } else {
        toast.success(t('commonToast.settingsSaved'));
      }
    },
    onError: (error: Error) => {
      if (error.message === 'CONFLICT') {
        onConflict();
      } else {
        toast.error(error.message);
      }
    },
  });

  return {
    query,
    currentSettings,
    isRawJsonValid,
    hasChanges,
    saveMutation,
    /** List of required env vars that are missing (empty if all present) - informational */
    missingRequiredFields: missingFields,
  };
}
