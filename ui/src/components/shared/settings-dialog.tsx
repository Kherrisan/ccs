/**
 * Settings Dialog Component
 * Reusable dialog for editing profile environment variables
 * Features: masked inputs for sensitive keys, conflict detection, save/cancel, raw JSON editor
 */

import { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaskedInput } from '@/components/ui/masked-input';
import { ConfirmDialog } from './confirm-dialog';
import { Save, X, Loader2, Code2 } from 'lucide-react';
import { toast } from 'sonner';
import i18n from '@/lib/i18n';

// Lazy load CodeEditor to reduce initial bundle size
const CodeEditor = lazy(() => import('./code-editor').then((m) => ({ default: m.CodeEditor })));

interface Settings {
  env?: Record<string, string>;
}

interface SettingsResponse {
  profile: string;
  settings: Settings;
  mtime: number;
  path: string;
}

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  profileName: string | null;
}

/**
 * Inner component that manages local edits state
 * Gets unmounted/remounted via key prop when dialog closes/opens
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function SettingsDialogContent({
  profileName,
  onClose,
}: {
  profileName: string;
  onClose: () => void;
}) {
  const [localEdits, setLocalEdits] = useState<Record<string, string>>({});
  const [conflictDialog, setConflictDialog] = useState(false);
  const [rawJsonEdits, setRawJsonEdits] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('env');
  const queryClient = useQueryClient();

  // Fetch settings for selected profile
  const { data, isLoading, refetch } = useQuery<SettingsResponse>({
    queryKey: ['settings', profileName],
    queryFn: () => fetch(`/api/settings/${profileName}/raw`).then((r) => r.json()),
  });

  // Derive raw JSON content: use edits if available, otherwise serialize from data
  const settings = data?.settings;
  const rawJsonContent = useMemo(() => {
    if (rawJsonEdits !== null) {
      return rawJsonEdits;
    }
    if (settings) {
      return JSON.stringify(settings, null, 2);
    }
    return '';
  }, [rawJsonEdits, settings]);

  // Update raw JSON when user edits
  const handleRawJsonChange = useCallback((value: string) => {
    setRawJsonEdits(value);
  }, []);

  // Derive current settings by merging original data with local edits
  const currentSettings = useMemo((): Settings | undefined => {
    const settings = data?.settings;
    if (!settings) return undefined;
    return {
      ...settings,
      env: {
        ...settings.env,
        ...localEdits,
      },
    };
  }, [data?.settings, localEdits]);

  // Check if raw JSON is valid
  const isRawJsonValid = useMemo(() => {
    try {
      JSON.parse(rawJsonContent);
      return true;
    } catch {
      return false;
    }
  }, [rawJsonContent]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      let settingsToSave: Settings;

      // Determine what to save based on active tab
      if (activeTab === 'raw') {
        // Parse raw JSON content
        try {
          settingsToSave = JSON.parse(rawJsonContent);
        } catch {
          throw new Error('Invalid JSON');
        }
      } else {
        // Use form-based edits
        settingsToSave = {
          ...data?.settings,
          env: {
            ...data?.settings?.env,
            ...localEdits,
          },
        };
      }

      const res = await fetch(`/api/settings/${profileName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: settingsToSave,
          expectedMtime: data?.mtime,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', profileName] });
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast.success(i18n.t('commonToast.settingsSaved'));
      onClose();
    },
    onError: (error: Error) => {
      if (error.message === 'CONFLICT') {
        setConflictDialog(true);
      } else {
        toast.error(error.message);
      }
    },
  });

  const handleSave = () => {
    saveMutation.mutate();
  };

  const handleConflictResolve = async (overwrite: boolean) => {
    setConflictDialog(false);
    if (overwrite) {
      // Refetch to get new mtime, then save
      await refetch();
      saveMutation.mutate();
    } else {
      // Discard local changes and close
      onClose();
    }
  };

  const updateEnvValue = (key: string, value: string) => {
    setLocalEdits((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const isSensitiveKey = (key: string): boolean => {
    // Pattern-based matching for sensitive keys (same as backend)
    const sensitivePatterns = [
      /^ANTHROPIC_AUTH_TOKEN$/, // Exact match for Anthropic auth token
      /_API_KEY$/, // Keys ending with _API_KEY
      /_AUTH_TOKEN$/, // Keys ending with _AUTH_TOKEN
      /^API_KEY$/, // Exact match for API_KEY
      /^AUTH_TOKEN$/, // Exact match for AUTH_TOKEN
      /_SECRET$/, // Keys ending with _SECRET
      /^SECRET$/, // Exact match for SECRET
    ];
    return sensitivePatterns.some((pattern) => pattern.test(key));
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit Profile: {profileName}</DialogTitle>
        <DialogDescription>
          Configure environment variables and settings for this profile.
        </DialogDescription>
      </DialogHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">Loading settings...</span>
        </div>
      ) : (
        <div className="flex flex-col h-[60vh]">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <TabsList className="w-full justify-start border-b rounded-none p-0 h-auto bg-transparent">
              <TabsTrigger
                value="env"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              >
                Environment
              </TabsTrigger>
              <TabsTrigger
                value="raw"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              >
                <Code2 className="w-4 h-4 mr-1" />
                Raw JSON
              </TabsTrigger>
              <TabsTrigger
                value="general"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              >
                General
              </TabsTrigger>
            </TabsList>

            <TabsContent value="env" className="flex-1 overflow-hidden p-4 pt-4 m-0">
              <ScrollArea className="h-full pr-4">
                {currentSettings?.env && Object.keys(currentSettings.env).length > 0 ? (
                  <div className="space-y-6">
                    {Object.entries(currentSettings.env).map(([key, value]) => (
                      <div key={key} className="space-y-2">
                        <Label className="text-sm font-medium text-foreground">{key}</Label>
                        {isSensitiveKey(key) ? (
                          <MaskedInput
                            value={value}
                            onChange={(e) => updateEnvValue(key, e.target.value)}
                            className="font-mono text-sm"
                          />
                        ) : (
                          <Input
                            value={value}
                            onChange={(e) => updateEnvValue(key, e.target.value)}
                            className="font-mono text-sm"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
                    <p>No environment variables configured.</p>
                    <p className="text-xs mt-1">Add variables in your settings.json file.</p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="raw" className="m-0 min-h-0 flex-1 overflow-hidden p-4 pt-4">
              <Suspense
                fallback={
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground">Loading editor...</span>
                  </div>
                }
              >
                <CodeEditor
                  value={rawJsonContent}
                  onChange={handleRawJsonChange}
                  language="json"
                  minHeight="calc(60vh - 120px)"
                  heightMode="fill-parent"
                />
              </Suspense>
            </TabsContent>

            <TabsContent value="general" className="p-4 m-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Profile Information</CardTitle>
                  <CardDescription>Details about this configuration file.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {data && (
                    <>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <span className="font-medium text-muted-foreground">Path</span>
                        <code className="col-span-2 bg-muted p-1 rounded text-xs break-all">
                          {data.path}
                        </code>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <span className="font-medium text-muted-foreground">Last Modified</span>
                        <span className="col-span-2">{new Date(data.mtime).toLocaleString()}</span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="pt-4 mt-auto border-t flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="w-4 h-4 mr-2" /> Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || (activeTab === 'raw' && !isRawJsonValid)}
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" /> Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={conflictDialog}
        title="File Modified Externally"
        description="This settings file was modified by another process. Overwrite with your changes or discard?"
        confirmText="Overwrite"
        variant="destructive"
        onConfirm={() => handleConflictResolve(true)}
        onCancel={() => handleConflictResolve(false)}
      />
    </>
  );
}

export function SettingsDialog({ open, onClose, profileName }: SettingsDialogProps) {
  // Handle dialog open/close state changes
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
        {/* Key prop ensures fresh state on each open */}
        {open && profileName && (
          <SettingsDialogContent
            key={`${profileName}-${open}`}
            profileName={profileName}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
