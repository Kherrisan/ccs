import { useMemo, useState } from 'react';
import { KeyRound, Loader2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CodexModelProviderPatchValues } from '@/hooks/use-codex-types';
import type { CodexModelProviderEntry } from '@/lib/codex-config';
import { CodexConfigCardShell } from './codex-config-card-shell';

interface CodexModelProvidersCardProps {
  entries: CodexModelProviderEntry[];
  disabled?: boolean;
  disabledReason?: string | null;
  saving?: boolean;
  onSave: (name: string, values: CodexModelProviderPatchValues) => Promise<void> | void;
  onDelete: (name: string) => Promise<void> | void;
}

const EMPTY_MODEL_PROVIDER_DRAFT: CodexModelProviderEntry = {
  name: '',
  displayName: null,
  baseUrl: null,
  envKey: null,
  wireApi: 'responses',
  requiresOpenaiAuth: false,
  supportsWebsockets: false,
};

const CLIPROXY_CODEX_PROVIDER_PRESET: CodexModelProviderEntry = {
  name: 'cliproxy',
  displayName: 'CLIProxy Codex',
  baseUrl: 'http://127.0.0.1:8317/api/provider/codex',
  envKey: 'CLIPROXY_API_KEY',
  wireApi: 'responses',
  requiresOpenaiAuth: false,
  supportsWebsockets: false,
};

interface ModelProviderEditorProps {
  initialDraft: CodexModelProviderEntry;
  isNew: boolean;
  disabled: boolean;
  saving: boolean;
  canDelete: boolean;
  onSave: (name: string, values: CodexModelProviderPatchValues) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
}

function ModelProviderEditor({
  initialDraft,
  isNew,
  disabled,
  saving,
  canDelete,
  onSave,
  onDelete,
}: ModelProviderEditorProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<CodexModelProviderEntry>(initialDraft);

  return (
    <>
      {isNew && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          <p>
            {/* TODO i18n: missing key codex.cliproxyQuickStart */}
            Quick start: apply the CLIProxy Codex preset here, then set{' '}
            <strong>{t('codex.defaultProvider')}</strong> to <code>cliproxy</code> in Top-level
            settings.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDraft(CLIPROXY_CODEX_PROVIDER_PRESET)}
            disabled={disabled}
          >
            {/* TODO i18n: missing key codex.useCliproxyCodexPreset */}
            Use CLIProxy Codex preset
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          // TODO i18n: missing key codex.providerId
          placeholder="Provider id"
          disabled={disabled || !isNew}
        />
        <Input
          value={draft.displayName ?? ''}
          onChange={(event) =>
            setDraft((current) => ({ ...current, displayName: event.target.value || null }))
          }
          // TODO i18n: missing key codex.displayName
          placeholder="Display name"
          disabled={disabled}
        />
        <Input
          value={draft.baseUrl ?? ''}
          onChange={(event) =>
            setDraft((current) => ({ ...current, baseUrl: event.target.value || null }))
          }
          placeholder="http://127.0.0.1:8317/api/provider/codex"
          disabled={disabled}
        />
        <Input
          value={draft.envKey ?? ''}
          onChange={(event) =>
            setDraft((current) => ({ ...current, envKey: event.target.value || null }))
          }
          placeholder="CLIPROXY_API_KEY"
          disabled={disabled}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          value={draft.wireApi ?? 'responses'}
          onValueChange={(next) => setDraft((current) => ({ ...current, wireApi: next }))}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="responses">{t('codex.responses')}</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
          {/* TODO i18n: missing key codex.requiresOpenaiAuth */}
          Requires OpenAI auth
          <Switch
            checked={draft.requiresOpenaiAuth}
            onCheckedChange={(next) =>
              setDraft((current) => ({ ...current, requiresOpenaiAuth: next }))
            }
            disabled={disabled}
          />
        </label>
        <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
          {/* TODO i18n: missing key codex.supportsWebsockets */}
          Supports websockets
          <Switch
            checked={draft.supportsWebsockets}
            onCheckedChange={(next) =>
              setDraft((current) => ({ ...current, supportsWebsockets: next }))
            }
            disabled={disabled}
          />
        </label>
      </div>

      <div className="flex justify-between gap-2">
        <Button variant="outline" onClick={onDelete} disabled={disabled || saving || !canDelete}>
          <Trash2 className="mr-2 h-4 w-4" />
          {/* TODO i18n: missing key common.delete */}
          Delete
        </Button>
        <Button
          onClick={() =>
            onSave(draft.name, {
              displayName: draft.displayName,
              baseUrl: draft.baseUrl,
              envKey: draft.envKey,
              wireApi: draft.wireApi,
              requiresOpenaiAuth: draft.requiresOpenaiAuth,
              supportsWebsockets: draft.supportsWebsockets,
            })
          }
          disabled={disabled || saving || draft.name.trim().length === 0}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {/* TODO i18n: missing key codex.saveProvider */}
          Save provider
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {/* TODO i18n: missing key codex.nativeCodexCliproxyHint */}
        If you want plain native <code>codex</code> to default to CLIProxy, save a provider named{' '}
        <code>cliproxy</code> with <code>CLIPROXY_API_KEY</code> here, then pick{' '}
        <code>cliproxy</code> in the <strong>{t('codex.defaultProvider')}</strong> control above.
      </p>
    </>
  );
}

export function CodexModelProvidersCard({
  entries,
  disabled = false,
  disabledReason,
  saving = false,
  onSave,
  onDelete,
}: CodexModelProvidersCardProps) {
  const { t } = useTranslation();
  const [selectedName, setSelectedName] = useState<string>('new');
  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.name === selectedName) ?? null,
    [entries, selectedName]
  );
  const draftSeed = selectedEntry ?? EMPTY_MODEL_PROVIDER_DRAFT;
  const draftKey = JSON.stringify(draftSeed);

  return (
    <CodexConfigCardShell
      // TODO i18n: missing key codex.modelProviders
      title="Model providers"
      badge="model_providers"
      icon={<KeyRound className="h-4 w-4" />}
      // TODO i18n: missing key codex.modelProvidersDesc
      description="Edit the common provider fields CCS can support safely. Keep secret migration and inline bearer tokens in raw TOML."
      disabledReason={disabledReason}
    >
      <Select value={selectedName} onValueChange={setSelectedName} disabled={disabled}>
        <SelectTrigger>
          {/* TODO i18n: missing key codex.selectProvider */}
          <SelectValue placeholder="Select provider" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="new">{t('codex.createNewProvider')}</SelectItem>
          {entries.map((entry) => (
            <SelectItem key={entry.name} value={entry.name}>
              {entry.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ModelProviderEditor
        key={draftKey}
        initialDraft={draftSeed}
        isNew={selectedName === 'new'}
        disabled={disabled}
        saving={saving}
        canDelete={selectedEntry !== null}
        onDelete={async () => {
          if (!selectedEntry) return;
          await onDelete(selectedEntry.name);
          setSelectedName('new');
        }}
        onSave={async (name, values) => {
          await onSave(name, values);
          setSelectedName(name);
        }}
      />
    </CodexConfigCardShell>
  );
}
