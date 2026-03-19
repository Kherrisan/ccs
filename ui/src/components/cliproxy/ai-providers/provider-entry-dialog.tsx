import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
  AiProviderEntryView,
  AiProviderFamilyId,
  UpsertAiProviderEntryInput,
} from '../../../../../src/cliproxy/ai-providers';

interface ProviderEntryDialogProps {
  family: AiProviderFamilyId;
  entry?: AiProviderEntryView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: UpsertAiProviderEntryInput) => Promise<void> | void;
  isSaving: boolean;
}

function parseDelimitedLines(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseKeyValueLines(value: string): Array<{ key: string; value: string }> {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const separator = line.includes(':') ? ':' : '=';
      const [key, ...rest] = line.split(separator);
      return { key: key.trim(), value: rest.join(separator).trim() };
    })
    .filter((item) => item.key.length > 0);
}

function parseModelAliasLines(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [name, ...rest] = line.split('=');
      return { name: name.trim(), alias: rest.join('=').trim() };
    })
    .filter((item) => item.name.length > 0 || item.alias.length > 0);
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      rows={rows}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
    />
  );
}

function formatHeaders(entry?: AiProviderEntryView | null): string {
  return (entry?.headers || []).map((item) => `${item.key}: ${item.value}`).join('\n');
}

function formatExcludedModels(entry?: AiProviderEntryView | null): string {
  return (entry?.excludedModels || []).join('\n');
}

function formatModelAliases(entry?: AiProviderEntryView | null): string {
  return (entry?.models || []).map((item) => `${item.name}=${item.alias}`).join('\n');
}

export function ProviderEntryDialog({
  family,
  entry,
  open,
  onOpenChange,
  onSubmit,
  isSaving,
}: ProviderEntryDialogProps) {
  const isEditing = Boolean(entry);
  const supportsOpenAiCompat = family === 'openai-compatibility';
  const supportsClaudeAdvanced = family === 'claude-api-key';
  const [name, setName] = useState(() => entry?.name || '');
  const [baseUrl, setBaseUrl] = useState(() => entry?.baseUrl || '');
  const [proxyUrl, setProxyUrl] = useState(() => entry?.proxyUrl || '');
  const [prefix, setPrefix] = useState(() => entry?.prefix || '');
  const [apiKey, setApiKey] = useState('');
  const [apiKeys, setApiKeys] = useState('');
  const [headers, setHeaders] = useState(() => formatHeaders(entry));
  const [excludedModels, setExcludedModels] = useState(() => formatExcludedModels(entry));
  const [modelAliases, setModelAliases] = useState(() => formatModelAliases(entry));

  const secretHelper = useMemo(() => {
    if (!isEditing || !entry?.secretConfigured) return null;
    return supportsOpenAiCompat
      ? 'Leave API keys blank to keep the stored connector secrets.'
      : 'Leave API key blank to keep the stored secret.';
  }, [entry?.secretConfigured, isEditing, supportsOpenAiCompat]);

  const handleSubmit = async () => {
    const payload: UpsertAiProviderEntryInput = {
      name: supportsOpenAiCompat ? name : undefined,
      baseUrl,
      proxyUrl: supportsClaudeAdvanced ? proxyUrl : undefined,
      prefix: supportsClaudeAdvanced ? prefix : undefined,
      headers: parseKeyValueLines(headers),
      excludedModels: supportsClaudeAdvanced ? parseDelimitedLines(excludedModels) : undefined,
      models: parseModelAliasLines(modelAliases),
      preserveSecrets: isEditing && entry?.secretConfigured && !apiKey.trim() && !apiKeys.trim(),
      apiKey: supportsOpenAiCompat ? undefined : apiKey,
      apiKeys: supportsOpenAiCompat ? parseDelimitedLines(apiKeys) : undefined,
    };

    await onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit provider entry' : 'Add provider entry'}</DialogTitle>
          <DialogDescription>
            Configure this AI provider family without creating a separate CCS API Profile.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {supportsOpenAiCompat && (
            <div className="space-y-1.5">
              <Label htmlFor="connector-name">Connector Name</Label>
              <Input
                id="connector-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="openrouter"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="base-url">Base URL</Label>
            <Input
              id="base-url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://example.com/v1"
            />
          </div>

          {supportsOpenAiCompat ? (
            <div className="space-y-1.5">
              <Label>API Keys</Label>
              <TextArea
                value={apiKeys}
                onChange={setApiKeys}
                rows={4}
                placeholder="sk-...\nsk-..."
              />
              {secretHelper && <p className="text-xs text-muted-foreground">{secretHelper}</p>}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="api-key">API Key</Label>
              <Input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="sk-..."
              />
              {secretHelper && <p className="text-xs text-muted-foreground">{secretHelper}</p>}
            </div>
          )}

          {supportsClaudeAdvanced && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="prefix">Prefix</Label>
                <Input
                  id="prefix"
                  value={prefix}
                  onChange={(event) => setPrefix(event.target.value)}
                  placeholder="glm-"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proxy-url">Proxy URL</Label>
                <Input
                  id="proxy-url"
                  value={proxyUrl}
                  onChange={(event) => setProxyUrl(event.target.value)}
                  placeholder="http://127.0.0.1:8080"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Headers</Label>
            <TextArea
              value={headers}
              onChange={setHeaders}
              rows={3}
              placeholder="Authorization: Bearer ...&#10;X-Project: demo"
            />
          </div>

          {supportsClaudeAdvanced && (
            <div className="space-y-1.5">
              <Label>Excluded Models</Label>
              <TextArea
                value={excludedModels}
                onChange={setExcludedModels}
                rows={3}
                placeholder="claude-opus-4-1&#10;claude-sonnet-4-5"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Model Aliases</Label>
            <TextArea
              value={modelAliases}
              onChange={setModelAliases}
              rows={4}
              placeholder="claude-sonnet=gemini-2.5-pro&#10;claude-haiku=gpt-4.1-mini"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={isSaving}>
            {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
