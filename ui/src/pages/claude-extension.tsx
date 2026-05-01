import { useState } from 'react';
import {
  AlertTriangle,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  type ClaudeExtensionActionTarget,
  type ClaudeExtensionBinding,
  type ClaudeExtensionBindingInput,
  type ClaudeExtensionFileState,
  type ClaudeExtensionTargetStatus,
  useApplyClaudeExtensionBinding,
  useClaudeExtensionBindingStatus,
  useClaudeExtensionBindings,
  useClaudeExtensionOptions,
  useClaudeExtensionSetup,
  useCreateClaudeExtensionBinding,
  useDeleteClaudeExtensionBinding,
  useResetClaudeExtensionBinding,
  useUpdateClaudeExtensionBinding,
} from '@/hooks/use-claude-extension';
import { cn } from '@/lib/utils';

const EMPTY_BINDINGS: ClaudeExtensionBinding[] = [];

interface BindingDraft {
  name: string;
  profile: string;
  host: 'vscode' | 'cursor' | 'windsurf';
  ideSettingsPath: string;
  notes: string;
}

function createEmptyDraft(profile: string): BindingDraft {
  return {
    name: '',
    profile,
    host: 'vscode',
    ideSettingsPath: '',
    notes: '',
  };
}

function bindingToDraft(binding: ClaudeExtensionBinding): BindingDraft {
  return {
    name: binding.name,
    profile: binding.profile,
    host: binding.host,
    ideSettingsPath: binding.ideSettingsPath || '',
    notes: binding.notes || '',
  };
}

function normalizeBindingDraft(draft: BindingDraft): ClaudeExtensionBindingInput {
  return {
    name: draft.name.trim(),
    profile: draft.profile.trim(),
    host: draft.host,
    ideSettingsPath: draft.ideSettingsPath.trim() || undefined,
    notes: draft.notes.trim() || undefined,
  };
}

function isPlainStatusActive(status?: ClaudeExtensionTargetStatus): boolean {
  return status?.state === 'applied';
}

function StatusBadge({ state }: { state: ClaudeExtensionFileState }) {
  const classes =
    state === 'applied'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : state === 'drifted'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : state === 'missing'
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-border bg-muted text-muted-foreground';

  return (
    <Badge variant="outline" className={classes}>
      {state}
    </Badge>
  );
}

function formatPathForDisplay(value: string): string {
  return value.replace(/[\\/]/g, '$&\u200b');
}

function DetailRow({
  label,
  value,
  mono = false,
  copyValue,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyValue?: string;
}) {
  const isPathRow = typeof copyValue === 'string' && copyValue.trim().length > 0;

  return (
    <div className="grid gap-2 text-sm sm:grid-cols-[112px_minmax(0,1fr)] sm:items-start">
      <span className="text-muted-foreground">{label}</span>
      {isPathRow ? (
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1 rounded-md border bg-muted/25 px-3 py-2">
            <span className="block text-left font-mono text-xs leading-5 [overflow-wrap:anywhere]">
              {formatPathForDisplay(value)}
            </span>
          </div>
          <CopyButton
            value={copyValue}
            label={`Copy ${label.toLowerCase()}`}
            className="shrink-0"
          />
        </div>
      ) : (
        <span
          className={cn(
            'text-left sm:text-right',
            mono && 'font-mono text-xs leading-5 [overflow-wrap:anywhere]'
          )}
        >
          {value}
        </span>
      )}
    </div>
  );
}

function CodeBlockCard({
  title,
  description,
  value,
}: {
  title: string;
  description: string;
  value: string;
}) {
  return (
    <Card className="border-border/60 bg-card/80">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          <CopyButton value={value} label={`Copy ${title}`} />
        </div>
      </CardHeader>
      <CardContent>
        <pre className="max-h-[360px] overflow-auto rounded-lg border bg-muted/30 p-4 text-xs leading-6">
          {value}
        </pre>
      </CardContent>
    </Card>
  );
}

function TargetStatusCard({
  title,
  description,
  status,
  applyLabel,
  resetLabel,
  onApply,
  onReset,
  disabled,
  busy,
}: {
  title: string;
  description: string;
  status?: ClaudeExtensionTargetStatus;
  applyLabel: string;
  resetLabel: string;
  onApply: () => void;
  onReset: () => void;
  disabled: boolean;
  busy: boolean;
}) {
  return (
    <Card className="border-border/60 bg-card/80">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          {status ? <StatusBadge state={status.state} /> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <DetailRow
            label="Path"
            value={status?.path || 'Save a binding first'}
            mono
            copyValue={status?.path}
          />
          <DetailRow
            label="File"
            value={status ? (status.exists ? 'Present' : 'Not created yet') : 'Unavailable'}
          />
        </div>

        <div className="rounded-lg border bg-muted/25 p-3 text-sm text-muted-foreground">
          {status?.message ||
            i18n.t('claudeExtensionPage.verifyAfterSaving', {
              defaultValue: 'Verify the binding after saving to inspect the current file state.',
            })}
        </div>

        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={onApply} disabled={disabled || busy}>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {applyLabel}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={onReset}
            disabled={disabled || busy}
          >
            {resetLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BindingListItem({
  binding,
  isSelected,
  onSelect,
}: {
  binding: ClaudeExtensionBinding;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full rounded-lg border px-3 py-3 text-left transition-colors',
        isSelected
          ? 'border-primary/40 bg-primary/10'
          : 'border-border/60 bg-card hover:bg-muted/40'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{binding.name}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {binding.profile} · {binding.host}
          </div>
        </div>
        <Badge variant="outline" className="shrink-0">
          {binding.usesDefaultIdeSettingsPath ? 'Default path' : 'Custom path'}
        </Badge>
      </div>
    </button>
  );
}

export function ClaudeExtensionPage() {
  const { t } = useTranslation();
  const optionsQuery = useClaudeExtensionOptions();
  const bindingsQuery = useClaudeExtensionBindings();
  const createBinding = useCreateClaudeExtensionBinding();
  const updateBinding = useUpdateClaudeExtensionBinding();
  const deleteBinding = useDeleteClaudeExtensionBinding();
  const applyBinding = useApplyClaudeExtensionBinding();
  const resetBinding = useResetClaudeExtensionBinding();

  const profiles = optionsQuery.data?.profiles ?? [];
  const hosts = optionsQuery.data?.hosts ?? [];
  const bindings = bindingsQuery.data?.bindings ?? EMPTY_BINDINGS;
  const defaultProfile = profiles[0]?.name ?? 'default';

  const [isCreating, setIsCreating] = useState(false);
  const [selectedBindingId, setSelectedBindingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BindingDraft>(() => createEmptyDraft('default'));

  const creating = isCreating || bindings.length === 0;
  const selectedBinding =
    !creating && bindings.length > 0
      ? (bindings.find((binding) => binding.id === selectedBindingId) ??
        (selectedBindingId ? null : bindings[0]))
      : null;
  const effectiveSelectedBindingId = selectedBinding?.id ?? null;
  const currentDraft =
    creating || !selectedBinding
      ? draft
      : selectedBindingId
        ? draft
        : bindingToDraft(selectedBinding);

  const setupQuery = useClaudeExtensionSetup(currentDraft.profile, currentDraft.host);
  const statusQuery = useClaudeExtensionBindingStatus(
    creating ? undefined : effectiveSelectedBindingId || undefined
  );

  const selectedHost = hosts.find((host) => host.id === currentDraft.host);
  const selectedProfile = profiles.find((profile) => profile.name === currentDraft.profile);
  const activeError =
    (optionsQuery.error as Error | null) ||
    (bindingsQuery.error as Error | null) ||
    (setupQuery.error as Error | null) ||
    (statusQuery.error as Error | null);

  const bindingCountLabel = `${bindings.length} saved`;
  const isSaving = createBinding.isPending || updateBinding.isPending;
  const isBusyShared =
    (applyBinding.isPending && applyBinding.variables?.target === 'shared') ||
    (resetBinding.isPending && resetBinding.variables?.target === 'shared');
  const isBusyIde =
    (applyBinding.isPending && applyBinding.variables?.target === 'ide') ||
    (resetBinding.isPending && resetBinding.variables?.target === 'ide');
  const canPersist = currentDraft.name.trim().length > 0 && currentDraft.profile.trim().length > 0;

  const setup = setupQuery.data;
  const status = statusQuery.data;
  const hiddenEnvCount = Math.max((setup?.env.length ?? 0) - 6, 0);
  const envPreview = setup?.env.slice(0, 6) ?? [];

  function startCreateMode(): void {
    setIsCreating(true);
    setSelectedBindingId(null);
    setDraft(createEmptyDraft(defaultProfile));
  }

  async function handleSave(): Promise<void> {
    if (!canPersist) return;

    const payload = normalizeBindingDraft(currentDraft);
    if (!creating && effectiveSelectedBindingId) {
      const result = await updateBinding.mutateAsync({
        id: effectiveSelectedBindingId,
        binding: payload,
      });
      setIsCreating(false);
      setSelectedBindingId(result.binding.id);
      setDraft(bindingToDraft(result.binding));
      return;
    }

    const result = await createBinding.mutateAsync(payload);
    setIsCreating(false);
    setSelectedBindingId(result.binding.id);
    setDraft(bindingToDraft(result.binding));
  }

  async function handleDelete(): Promise<void> {
    if (!effectiveSelectedBindingId || !selectedBinding) return;
    if (
      !window.confirm(
        t('claudeExtensionPage.deleteBindingConfirm', {
          name: selectedBinding.name,
          defaultValue: 'Delete binding "{{name}}"?',
        })
      )
    )
      return;

    await deleteBinding.mutateAsync(effectiveSelectedBindingId);
    const remaining = bindings.filter((binding) => binding.id !== effectiveSelectedBindingId);
    if (remaining.length > 0) {
      setSelectedBindingId(remaining[0].id);
      setIsCreating(false);
      setDraft(bindingToDraft(remaining[0]));
    } else {
      startCreateMode();
    }
  }

  function updateDraft<K extends keyof BindingDraft>(key: K, value: BindingDraft[K]): void {
    if (!creating && selectedBinding && !selectedBindingId) {
      setSelectedBindingId(selectedBinding.id);
      setDraft({ ...bindingToDraft(selectedBinding), [key]: value });
      setIsCreating(false);
      return;
    }
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function runBindingAction(target: ClaudeExtensionActionTarget, action: 'apply' | 'reset'): void {
    if (!effectiveSelectedBindingId) return;
    if (action === 'apply') {
      applyBinding.mutate({ id: effectiveSelectedBindingId, target });
      return;
    }
    resetBinding.mutate({ id: effectiveSelectedBindingId, target });
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="flex w-[348px] shrink-0 flex-col border-r bg-muted/30 xl:w-[372px]">
        <div className="border-b bg-background p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="rounded-lg border bg-muted/40 p-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h1 className="font-semibold">{t('claudeExtensionPage.title')}</h1>
                  <p className="text-xs text-muted-foreground">
                    {t('claudeExtensionPage.savedBindingsSubtitle', {
                      defaultValue: 'Saved IDE bindings for CCS profiles',
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{bindingCountLabel}</Badge>
                {selectedHost ? <Badge variant="outline">{selectedHost.label}</Badge> : null}
              </div>
            </div>
            <Button size="sm" onClick={startCreateMode} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {t('claudeExtensionPage.new', { defaultValue: 'New' })}
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-4 p-5">
            <Card className="border-border/60 bg-card/80">
              <CardHeader>
                <CardTitle className="text-base">
                  {creating
                    ? t('claudeExtensionPage.createBinding', { defaultValue: 'Create binding' })
                    : t('claudeExtensionPage.bindingEditor', { defaultValue: 'Binding editor' })}
                </CardTitle>
                <CardDescription>
                  {t('claudeExtensionPage.bindingEditorDescription', {
                    defaultValue:
                      'Save a profile + IDE path once, then apply or reset it from the dashboard.',
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    {t('settingsPage.thinkingSection.bindingName')}
                  </div>
                  <Input
                    value={currentDraft.name}
                    onChange={(event) => updateDraft('name', event.target.value)}
                    placeholder={t('claudeExtensionPage.bindingNamePlaceholder', {
                      defaultValue: 'VS Code · work profile',
                    })}
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    {t('claudeExtensionPage.ccsProfile', { defaultValue: 'CCS profile' })}
                  </div>
                  <Select
                    value={currentDraft.profile}
                    onValueChange={(value) => updateDraft('profile', value)}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t('claudeExtensionPage.selectProfile', {
                          defaultValue: 'Select a profile',
                        })}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map((profile) => (
                        <SelectItem key={profile.name} value={profile.name}>
                          {profile.label} ({profile.profileType})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {selectedProfile?.description ||
                      t('claudeExtensionPage.chooseProfileHint', {
                        defaultValue: 'Choose which CCS profile the IDE should inherit.',
                      })}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    {t('settingsPage.thinkingSection.ideHost')}
                  </div>
                  <Select
                    value={currentDraft.host}
                    onValueChange={(value) => updateDraft('host', value as BindingDraft['host'])}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t('claudeExtensionPage.selectHost', {
                          defaultValue: 'Select a host',
                        })}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {hosts.map((host) => (
                        <SelectItem key={host.id} value={host.id}>
                          {host.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    {t('settingsPage.thinkingSection.ideSettingsPath')}
                  </div>
                  <Input
                    value={currentDraft.ideSettingsPath}
                    onChange={(event) => updateDraft('ideSettingsPath', event.target.value)}
                    placeholder={
                      selectedHost?.defaultSettingsPath ||
                      t('claudeExtensionPage.ideSettingsPathPlaceholder', {
                        defaultValue: 'Leave blank for the default user settings path',
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('claudeExtensionPage.ideSettingsPathHint', {
                      defaultValue: 'Leave blank to use the default user settings path for',
                    })}{' '}
                    {selectedHost?.label || 'this IDE'}.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    {t('settingsPage.thinkingSection.notes')}
                  </div>
                  <Input
                    value={currentDraft.notes}
                    onChange={(event) => updateDraft('notes', event.target.value)}
                    placeholder={t('claudeExtensionPage.notesPlaceholder', {
                      defaultValue: 'Optional reminder for this machine or workspace',
                    })}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    className="flex-1 gap-1.5"
                    onClick={() => void handleSave()}
                    disabled={!canPersist || isSaving}
                  >
                    {isSaving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    {creating
                      ? t('claudeExtensionPage.create', { defaultValue: 'Create' })
                      : t('claudeExtensionPage.save', { defaultValue: 'Save' })}
                  </Button>
                  <Button variant="outline" onClick={startCreateMode}>
                    {t('claudeExtensionPage.resetForm', { defaultValue: 'Reset form' })}
                  </Button>
                </div>

                {!creating ? (
                  <Button
                    variant="outline"
                    className="w-full gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => void handleDelete()}
                    disabled={deleteBinding.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t('claudeExtensionPage.deleteBinding', { defaultValue: 'Delete binding' })}
                  </Button>
                ) : null}
              </CardContent>
            </Card>

            <div className="space-y-2">
              <div className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('claudeExtensionPage.savedBindings', { defaultValue: 'Saved bindings' })}
              </div>
              <div className="space-y-2">
                {bindings.length > 0 ? (
                  bindings.map((binding) => (
                    <BindingListItem
                      key={binding.id}
                      binding={binding}
                      isSelected={binding.id === effectiveSelectedBindingId && !creating}
                      onSelect={() => {
                        setIsCreating(false);
                        setSelectedBindingId(binding.id);
                        setDraft(bindingToDraft(binding));
                      }}
                    />
                  ))
                ) : (
                  <Card className="border-dashed border-border/60 bg-card/60">
                    <CardContent className="pt-6 text-sm text-muted-foreground">
                      {t('claudeExtensionPage.emptyBindings', {
                        defaultValue:
                          'No saved bindings yet. Create one to manage apply, reset, and drift checks from the dashboard.',
                      })}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>

      <div className="min-w-0 flex-1">
        <ScrollArea className="h-full">
          <div className="w-full space-y-6 p-6 xl:p-7 2xl:p-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {selectedProfile ? (
                    <Badge variant="outline">{selectedProfile.label}</Badge>
                  ) : null}
                  {selectedHost ? <Badge variant="outline">{selectedHost.label}</Badge> : null}
                  {creating ? (
                    <Badge variant="secondary">{t('settingsPage.thinkingSection.draft')}</Badge>
                  ) : null}
                  {status?.sharedSettings &&
                  isPlainStatusActive(status.sharedSettings) &&
                  isPlainStatusActive(status.ideSettings) ? (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600">
                      {t('settingsPage.thinkingSection.inSync')}
                    </Badge>
                  ) : null}
                </div>
                <div className="max-w-5xl">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {selectedBinding?.name ||
                      t('claudeExtensionPage.defaultBindingName', {
                        defaultValue: 'Claude extension binding',
                      })}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('claudeExtensionPage.bindingDescription', {
                      defaultValue:
                        'Manage the shared Claude settings file and the IDE-local settings file as two scoped targets.',
                    })}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => void statusQuery.refetch()}
                  disabled={creating || statusQuery.isFetching}
                >
                  {statusQuery.isFetching ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {t('claudeExtensionPage.verify', { defaultValue: 'Verify' })}
                </Button>
                {setup ? (
                  <CopyButton value={setup.sharedSettings.command} label="Copy persist command" />
                ) : null}
              </div>
            </div>

            {activeError ? (
              <Card className="border-destructive/40 bg-destructive/5">
                <CardContent className="flex items-start gap-3 pt-6 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>{activeError.message}</div>
                </CardContent>
              </Card>
            ) : null}

            {!activeError ? (
              <Tabs defaultValue="overview" className="flex flex-col gap-6">
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="overview">
                    {t('claudeExtensionPage.overview', { defaultValue: 'Overview' })}
                  </TabsTrigger>{' '}
                  <TabsTrigger value="advanced">
                    {t('settingsPage.thinkingSection.advanced')}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-0 space-y-6">
                  <div className="grid gap-6 xl:grid-cols-2">
                    <TargetStatusCard
                      title={t('claudeExtensionPage.sharedClaudeSettings', {
                        defaultValue: 'Shared Claude settings',
                      })}
                      description={t('claudeExtensionPage.sharedClaudeSettingsDescription', {
                        defaultValue:
                          'Writes the managed env block inside ~/.claude/settings.json so CLI and IDE behavior stay aligned.',
                      })}
                      status={status?.sharedSettings}
                      applyLabel={t('claudeExtensionPage.applyShared', {
                        defaultValue: 'Apply shared',
                      })}
                      resetLabel={t('claudeExtensionPage.resetShared', {
                        defaultValue: 'Reset shared',
                      })}
                      onApply={() => runBindingAction('shared', 'apply')}
                      onReset={() => runBindingAction('shared', 'reset')}
                      disabled={creating}
                      busy={isBusyShared}
                    />
                    <TargetStatusCard
                      title={`${selectedHost?.label || 'IDE'} settings.json`}
                      description="Writes only the Anthropic extension keys so unrelated editor preferences stay untouched."
                      status={status?.ideSettings}
                      applyLabel={t('claudeExtensionPage.applyIde', { defaultValue: 'Apply IDE' })}
                      resetLabel={t('claudeExtensionPage.resetIde', { defaultValue: 'Reset IDE' })}
                      onApply={() => runBindingAction('ide', 'apply')}
                      onReset={() => runBindingAction('ide', 'reset')}
                      disabled={creating}
                      busy={isBusyIde}
                    />
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                    <Card className="border-border/60 bg-card/80">
                      <CardHeader>
                        <CardTitle className="text-base">
                          {t('settingsPage.thinkingSection.resolvedBinding')}
                        </CardTitle>
                        <CardDescription>
                          {t('claudeExtensionPage.resolvedBindingDescription', {
                            defaultValue:
                              'The binding uses the same profile resolution as `ccs persist` and `ccs env`.',
                          })}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <DetailRow
                          label={t('claudeExtensionPage.profile', { defaultValue: 'Profile' })}
                          value={setup?.profile.label || currentDraft.profile || 'Not selected'}
                        />
                        <DetailRow
                          label={t('claudeExtensionPage.profileType', {
                            defaultValue: 'Profile type',
                          })}
                          value={setup?.profile.profileType || 'Unknown'}
                        />
                        <DetailRow label="IDE host" value={selectedHost?.label || 'Not selected'} />
                        <DetailRow
                          label={t('claudeExtensionPage.idePathMode', {
                            defaultValue: 'IDE path mode',
                          })}
                          value={
                            currentDraft.ideSettingsPath.trim()
                              ? t('claudeExtensionPage.customPath', { defaultValue: 'Custom path' })
                              : t('claudeExtensionPage.defaultUserPath', {
                                  defaultValue: 'Default user path',
                                })
                          }
                        />
                        <DetailRow
                          label={t('claudeExtensionPage.effectiveIdePath', {
                            defaultValue: 'Effective IDE path',
                          })}
                          value={
                            status?.ideSettings.path ||
                            currentDraft.ideSettingsPath.trim() ||
                            selectedHost?.defaultSettingsPath ||
                            'Unavailable'
                          }
                          mono
                          copyValue={
                            status?.ideSettings.path ||
                            currentDraft.ideSettingsPath.trim() ||
                            selectedHost?.defaultSettingsPath
                          }
                        />
                        <DetailRow
                          label={t('claudeExtensionPage.persistCommand', {
                            defaultValue: 'Persist command',
                          })}
                          value={
                            setup?.sharedSettings.command ||
                            t('claudeExtensionPage.saveValidBindingFirst', {
                              defaultValue: 'Save a valid binding first',
                            })
                          }
                          mono
                        />
                        {currentDraft.notes.trim() ? (
                          <DetailRow
                            label={t('settingsPage.thinkingSection.notes')}
                            value={currentDraft.notes.trim()}
                          />
                        ) : null}
                      </CardContent>
                    </Card>

                    <Card className="border-border/60 bg-card/80">
                      <CardHeader>
                        <CardTitle className="text-base">
                          {t('settingsPage.thinkingSection.managedPayload')}
                        </CardTitle>
                        <CardDescription>
                          {t('claudeExtensionPage.managedPayloadDescription', {
                            defaultValue:
                              'Keep the main view short. The full JSON stays in the Advanced tab.',
                          })}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                          {envPreview.map((entry) => (
                            <Badge
                              key={entry.name}
                              variant="secondary"
                              className="font-mono text-[10px]"
                            >
                              {entry.name}
                            </Badge>
                          ))}
                          {hiddenEnvCount > 0 ? (
                            <Badge variant="outline">+{hiddenEnvCount} more</Badge>
                          ) : null}
                        </div>

                        <div className="rounded-lg border bg-muted/25 p-4 text-sm">
                          {setup?.env.length ? (
                            <div className="space-y-2">
                              <div className="font-medium">
                                {t('claudeExtensionPage.envInjected', {
                                  count: setup.env.length,
                                  defaultValue: 'CCS will inject {{count}} environment values.',
                                })}
                              </div>
                              <div className="text-muted-foreground">
                                {t('claudeExtensionPage.envInjectedDescription', {
                                  defaultValue:
                                    'The IDE-local target receives the extension schema. The shared target receives the same env block through Claude settings.',
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="text-muted-foreground">
                              {t('claudeExtensionPage.nativeDefaultsDescription', {
                                defaultValue:
                                  'This profile resolves to native Claude defaults, so apply/reset mainly clears existing CCS-managed overrides.',
                              })}
                            </div>
                          )}
                        </div>

                        {!creating ? (
                          <div className="flex gap-2">
                            <Button
                              className="flex-1"
                              onClick={() => runBindingAction('all', 'apply')}
                              disabled={applyBinding.isPending}
                            >
                              {applyBinding.isPending &&
                              applyBinding.variables?.target === 'all' ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : null}
                              {t('claudeExtensionPage.applyBothTargets', {
                                defaultValue: 'Apply both targets',
                              })}
                            </Button>
                            <Button
                              variant="outline"
                              className="flex-1"
                              onClick={() => runBindingAction('all', 'reset')}
                              disabled={resetBinding.isPending}
                            >
                              {t('claudeExtensionPage.resetBothTargets', {
                                defaultValue: 'Reset both targets',
                              })}
                            </Button>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed bg-muted/15 p-4 text-sm text-muted-foreground">
                            {t('claudeExtensionPage.saveDraftToUnlock', {
                              defaultValue:
                                'Save this draft to unlock apply, reset, and verify actions.',
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {setup && (setup.warnings.length > 0 || setup.notes.length > 0) ? (
                    <div className="grid gap-6 xl:grid-cols-2">
                      <Card className="border-border/60 bg-card/80">
                        <CardHeader>
                          <CardTitle className="text-base">
                            {t('settingsPage.thinkingSection.warnings')}
                          </CardTitle>
                          <CardDescription>
                            Operational details that can break the binding even when JSON is
                            correct.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {setup.warnings.length > 0 ? (
                            setup.warnings.map((warning) => (
                              <div
                                key={warning}
                                className="flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-50/60 p-3 text-sm dark:bg-amber-950/10"
                              >
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                                <span>{warning}</span>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                              No runtime warnings for this binding.
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <Card className="border-border/60 bg-card/80">
                        <CardHeader>
                          <CardTitle className="text-base">
                            {t('settingsPage.thinkingSection.notes')}
                          </CardTitle>
                          <CardDescription>
                            Short context from CCS about account continuity and host-specific
                            behavior.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {setup.notes.length > 0 ? (
                            setup.notes.map((note) => (
                              <div
                                key={note}
                                className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm"
                              >
                                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                <span>{note}</span>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                              No extra notes for this binding.
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  ) : null}
                </TabsContent>

                <TabsContent value="advanced" className="mt-0 space-y-6">
                  {setup ? (
                    <>
                      <div className="grid gap-6 xl:grid-cols-2">
                        <CodeBlockCard
                          title={t('claudeExtensionPage.sharedSettingsJson', {
                            defaultValue: 'Shared Claude settings JSON',
                          })}
                          description={t('claudeExtensionPage.sharedSettingsJsonDescription', {
                            defaultValue: 'Managed env block for ~/.claude/settings.json.',
                          })}
                          value={setup.sharedSettings.json}
                        />
                        <CodeBlockCard
                          title={`${selectedHost?.label || 'IDE'} settings JSON`}
                          description={t('claudeExtensionPage.ideSettingsJsonDescription', {
                            label: selectedHost?.settingsTargetLabel || 'settings.json',
                            defaultValue: 'Anthropic extension snippet for {{label}}.',
                          })}
                          value={setup.ideSettings.json}
                        />
                      </div>

                      <Card className="border-border/60 bg-card/80">
                        <CardHeader>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <CardTitle className="text-base">
                                {t('claudeExtensionPage.resolvedEnvironmentPayload', {
                                  defaultValue: 'Resolved environment payload',
                                })}
                              </CardTitle>
                              <CardDescription>
                                {t('claudeExtensionPage.resolvedEnvironmentPayloadDescription', {
                                  defaultValue:
                                    'Exact environment values that the extension receives after CCS expands this profile.',
                                })}
                              </CardDescription>
                            </div>
                            <CopyButton
                              value={JSON.stringify(setup.env, null, 2)}
                              label={t('claudeExtensionPage.copyEnvironmentPayload', {
                                defaultValue: 'Copy environment payload',
                              })}
                            />
                          </div>
                        </CardHeader>
                        <CardContent>
                          {setup.env.length > 0 ? (
                            <pre className="max-h-[420px] overflow-auto rounded-lg border bg-muted/30 p-4 text-xs leading-6">
                              {JSON.stringify(setup.env, null, 2)}
                            </pre>
                          ) : (
                            <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
                              No env payload. This binding resolves to native Claude defaults.
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <div className="grid gap-6 xl:grid-cols-2">
                        <Card className="border-border/60 bg-card/80">
                          <CardHeader>
                            <CardTitle className="text-base">Shared target metadata</CardTitle>
                            <CardDescription>
                              Useful when debugging drift or comparing with manual edits.
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <DetailRow
                              label="Target path"
                              value={status?.sharedSettings.path || setup.sharedSettings.path}
                              mono
                              copyValue={status?.sharedSettings.path || setup.sharedSettings.path}
                            />
                            <DetailRow label="Command" value={setup.sharedSettings.command} mono />
                            <DetailRow
                              label="Current state"
                              value={status?.sharedSettings.state || 'Not verified'}
                            />
                          </CardContent>
                        </Card>

                        <Card className="border-border/60 bg-card/80">
                          <CardHeader>
                            <CardTitle className="text-base">IDE target metadata</CardTitle>
                            <CardDescription>
                              Current file path plus the extension setting key used for this host.
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <DetailRow
                              label="Target path"
                              value={
                                status?.ideSettings.path ||
                                currentDraft.ideSettingsPath.trim() ||
                                selectedHost?.defaultSettingsPath ||
                                setup.ideSettings.path
                              }
                              mono
                              copyValue={
                                status?.ideSettings.path ||
                                currentDraft.ideSettingsPath.trim() ||
                                selectedHost?.defaultSettingsPath ||
                                setup.ideSettings.path
                              }
                            />
                            <DetailRow
                              label="Settings key"
                              value={selectedHost?.settingsKey || 'Unknown'}
                              mono
                            />
                            <DetailRow
                              label="Current state"
                              value={status?.ideSettings.state || 'Not verified'}
                            />
                          </CardContent>
                        </Card>
                      </div>
                    </>
                  ) : (
                    <Card className="border-border/60 bg-card/80">
                      <CardContent className="flex min-h-[240px] items-center justify-center gap-3 text-sm text-muted-foreground">
                        <Settings2 className="h-5 w-5" />
                        Choose a profile and IDE host to preview the generated payload.
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>
            ) : null}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
