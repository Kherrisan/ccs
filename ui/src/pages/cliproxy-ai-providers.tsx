import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AiProviderEntryView, AiProviderFamilyId } from '../../../src/cliproxy/ai-providers';
import { ProviderLogo } from '@/components/cliproxy/provider-logo';
import { ProxyStatusWidget } from '@/components/monitoring/proxy-status-widget';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  FamilyRail,
  ProviderEntryCard,
  ProviderEntryDialog,
} from '@/components/cliproxy/ai-providers';
import {
  useCliproxyAiProviders,
  useCreateCliproxyAiProviderEntry,
  useDeleteCliproxyAiProviderEntry,
  useUpdateCliproxyAiProviderEntry,
} from '@/hooks/use-cliproxy-ai-providers';
import {
  Check,
  ExternalLink,
  KeyRound,
  ListFilter,
  Plus,
  RefreshCw,
  ShieldCheck,
  Zap,
} from 'lucide-react';

function getFamilyProvider(familyId: AiProviderFamilyId): string {
  switch (familyId) {
    case 'gemini-api-key':
      return 'gemini';
    case 'codex-api-key':
      return 'codex';
    case 'claude-api-key':
      return 'claude';
    case 'vertex-api-key':
      return 'vertex';
    case 'openai-compatibility':
      return 'openrouter';
  }
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 break-all text-sm font-medium leading-5">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function getFamilyStatusBadge(status: 'empty' | 'partial' | 'ready') {
  switch (status) {
    case 'ready':
      return {
        label: 'Ready',
        className: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50',
      };
    case 'partial':
      return {
        label: 'Needs attention',
        className: 'bg-amber-50 text-amber-700 hover:bg-amber-50',
      };
    default:
      return {
        label: 'Empty',
        className: 'bg-muted text-muted-foreground hover:bg-muted',
      };
  }
}

function EmptyEntryWorkspace({
  familyDisplayName,
  routePath,
  authMode,
  onAddEntry,
  onOpenControlPanel,
  onOpenProfiles,
}: {
  familyDisplayName: string;
  routePath: string;
  authMode: string;
  onAddEntry: () => void;
  onOpenControlPanel: () => void;
  onOpenProfiles: () => void;
}) {
  return (
    <div className="space-y-4 p-6">
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <KeyRound className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold">No entries configured yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Store {familyDisplayName} keys here so CLIProxy can serve this route directly
                without asking users to create a separate CCS API Profile.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <SummaryCard label="Route" value={routePath} hint="served by CLIProxy" />
              <SummaryCard label="Auth Mode" value={authMode.toUpperCase()} />
              <SummaryCard label="Ownership" value="AI Providers" hint="OAuth stays in Overview" />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={onAddEntry}>
                <Plus className="mr-1 h-4 w-4" />
                Add {familyDisplayName} Entry
              </Button>
              <Button type="button" variant="outline" onClick={onOpenControlPanel}>
                Control Panel
              </Button>
              <Button type="button" variant="outline" onClick={onOpenProfiles}>
                API Profiles
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5">
        <div className="text-sm font-medium">Where to configure what</div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Overview
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              OAuth accounts, account health, variants, and browser sign-in flows.
            </p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              AI Providers
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              CLIProxy-managed API keys, connector routes, aliases, and provider-level overrides.
            </p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              API Profiles
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              CCS-native Anthropic-compatible profiles such as GLM, Kimi, OpenRouter, and custom
              gateways.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CliproxyAiProvidersPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data, isLoading, isFetching, refetch } = useCliproxyAiProviders();
  const createMutation = useCreateCliproxyAiProviderEntry();
  const updateMutation = useUpdateCliproxyAiProviderEntry();
  const deleteMutation = useDeleteCliproxyAiProviderEntry();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AiProviderEntryView | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<AiProviderEntryView | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const families = useMemo(() => data?.families ?? [], [data?.families]);
  const requestedFamily = useMemo(
    () => (new URLSearchParams(location.search).get('family') as AiProviderFamilyId | null) || null,
    [location.search]
  );
  const selectedFamily = useMemo<AiProviderFamilyId>(() => {
    if (requestedFamily && families.some((family) => family.id === requestedFamily)) {
      return requestedFamily;
    }

    return families[0]?.id ?? 'gemini-api-key';
  }, [families, requestedFamily]);

  const selectedFamilyState = useMemo(
    () => families.find((family) => family.id === selectedFamily) || null,
    [families, selectedFamily]
  );

  const handleFamilySelect = (family: AiProviderFamilyId) => {
    navigate({ pathname: location.pathname, search: `?family=${family}` }, { replace: true });
  };

  const openCreateDialog = () => {
    setEditingEntry(null);
    setDialogOpen(true);
  };

  const effectiveSelectedEntryId = useMemo(() => {
    const entries = selectedFamilyState?.entries ?? [];
    if (entries.length === 0) {
      return null;
    }

    if (selectedEntryId && entries.some((entry) => entry.id === selectedEntryId)) {
      return selectedEntryId;
    }

    return entries[0]?.id ?? null;
  }, [selectedEntryId, selectedFamilyState?.entries]);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-100px)] min-h-0">
        <Skeleton className="h-full w-80 rounded-none" />
        <Skeleton className="h-full flex-1 rounded-none" />
      </div>
    );
  }

  if (!selectedFamilyState || !data) {
    return null;
  }

  const configuredEntries = selectedFamilyState.entries.filter((entry) => entry.secretConfigured);
  const readyFamilies = families.filter((family) => family.status === 'ready').length;
  const selectedEntry =
    selectedFamilyState.entries.find((entry) => entry.id === effectiveSelectedEntryId) ?? null;
  const statusBadge = getFamilyStatusBadge(selectedFamilyState.status);

  return (
    <div className="flex h-[calc(100vh-100px)] min-h-0">
      <div className="flex w-80 flex-col border-r bg-muted/30">
        <div className="border-b bg-background p-4">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <h1 className="font-semibold">CLIProxy Plus</h1>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </Button>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">AI provider key management</p>

          <Button
            variant="default"
            size="sm"
            className="w-full gap-2"
            type="button"
            onClick={openCreateDialog}
          >
            <Plus className="h-4 w-4" />
            Add Entry
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Provider Families
            </div>
            <FamilyRail
              families={families}
              selectedFamily={selectedFamily}
              onSelect={handleFamilySelect}
            />
          </div>
        </ScrollArea>

        <div className="border-t p-3">
          <ProxyStatusWidget />
        </div>

        <div className="border-t bg-background p-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>{families.length} families</span>
            <span className="flex items-center gap-1">
              <Check className="h-3 w-3 text-emerald-600" />
              {readyFamilies} ready
            </span>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <div className="shrink-0 border-b bg-background px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <ProviderLogo provider={getFamilyProvider(selectedFamilyState.id)} size="lg" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{selectedFamilyState.displayName}</h2>
                  <Badge variant="secondary" className={statusBadge.className}>
                    {statusBadge.label}
                  </Badge>
                  <Badge variant="outline" className="uppercase">
                    {selectedFamilyState.authMode}
                  </Badge>
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {selectedFamilyState.routePath}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {selectedFamilyState.description}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/cliproxy/control-panel')}
              >
                Control Panel
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/providers')}>
                API Profiles
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </Button>
              <Button type="button" onClick={openCreateDialog}>
                <Plus className="mr-1 h-4 w-4" />
                Add Entry
              </Button>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[36%_64%] divide-x overflow-hidden">
          <div className="flex flex-col overflow-hidden bg-muted/5">
            <div className="shrink-0 px-4 pt-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <SummaryCard
                  label="Entries"
                  value={`${selectedFamilyState.entries.length}`}
                  hint="configured rows"
                />
                <SummaryCard
                  label="Secrets"
                  value={`${configuredEntries.length}/${selectedFamilyState.entries.length || 0}`}
                  hint="rows with stored secrets"
                />
              </div>

              <div className="mt-3 rounded-lg border bg-background p-3">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Runtime separation</div>
                    <p className="text-xs text-muted-foreground">
                      AI Providers owns CLIProxy routes and secrets. OAuth stays in Overview.
                      Anthropic-compatible CCS profiles stay in API Profiles.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4 pt-3">
                <div className="flex items-center justify-between pb-2">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <ListFilter className="h-3 w-3" />
                    Entry Inventory
                  </div>
                  <Button type="button" size="sm" variant="ghost" onClick={openCreateDialog}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>

                {selectedFamilyState.entries.length === 0 ? (
                  <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
                    No entries in this family yet. Add the first one to start routing requests
                    through CLIProxy.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedFamilyState.entries.map((entry) => (
                      <ProviderEntryCard
                        key={entry.id}
                        family={selectedFamilyState}
                        entry={entry}
                        variant="row"
                        isSelected={entry.id === effectiveSelectedEntryId}
                        onSelect={() => setSelectedEntryId(entry.id)}
                        onEdit={() => {
                          setEditingEntry(entry);
                          setDialogOpen(true);
                        }}
                        onDelete={() => setDeleteEntry(entry)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          <ScrollArea className="flex-1">
            {selectedEntry ? (
              <div className="space-y-4 p-6">
                <div className="grid gap-3 xl:grid-cols-3">
                  <SummaryCard
                    label="Sync Source"
                    value={data.source.label}
                    hint={data.source.target}
                  />
                  <SummaryCard
                    label="Base URL"
                    value={selectedEntry.baseUrl || 'Default runtime endpoint'}
                    hint="effective upstream"
                  />
                  <SummaryCard
                    label="Advanced Routing"
                    value={
                      selectedEntry.prefix ||
                      selectedEntry.proxyUrl ||
                      selectedEntry.excludedModels.length > 0
                        ? 'Configured'
                        : 'Default'
                    }
                    hint="prefix, proxy URL, or exclusions"
                  />
                </div>

                <ProviderEntryCard
                  family={selectedFamilyState}
                  entry={selectedEntry}
                  onEdit={() => {
                    setEditingEntry(selectedEntry);
                    setDialogOpen(true);
                  }}
                  onDelete={() => setDeleteEntry(selectedEntry)}
                />

                <div className="rounded-lg border bg-card p-4">
                  <div className="text-sm font-medium">Route responsibility</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Requests hitting{' '}
                    <span className="font-mono">{selectedFamilyState.routePath}</span> use this
                    CLIProxy-managed entry. If you need a CCS-native Anthropic-compatible profile,
                    create that under <span className="font-medium">API Profiles</span> instead.
                  </p>
                </div>
              </div>
            ) : (
              <EmptyEntryWorkspace
                familyDisplayName={selectedFamilyState.displayName}
                routePath={selectedFamilyState.routePath}
                authMode={selectedFamilyState.authMode}
                onAddEntry={openCreateDialog}
                onOpenControlPanel={() => navigate('/cliproxy/control-panel')}
                onOpenProfiles={() => navigate('/providers')}
              />
            )}
          </ScrollArea>
        </div>
      </div>

      <ProviderEntryDialog
        key={`${selectedFamily}:${editingEntry?.id ?? 'new'}:${dialogOpen ? 'open' : 'closed'}`}
        family={selectedFamily}
        entry={editingEntry}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={async (payload) => {
          if (editingEntry) {
            await updateMutation.mutateAsync({
              family: selectedFamily,
              index: editingEntry.index,
              data: payload,
            });
          } else {
            await createMutation.mutateAsync({ family: selectedFamily, data: payload });
          }
          setDialogOpen(false);
          setEditingEntry(null);
          void refetch();
        }}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />

      <ConfirmDialog
        open={deleteEntry !== null}
        title="Remove provider entry?"
        description={
          deleteEntry
            ? `This removes ${deleteEntry.label} from ${selectedFamilyState.displayName}.`
            : ''
        }
        confirmText="Remove"
        variant="destructive"
        onConfirm={async () => {
          if (!deleteEntry) return;
          await deleteMutation.mutateAsync({
            family: selectedFamily,
            index: deleteEntry.index,
          });
          setDeleteEntry(null);
        }}
        onCancel={() => setDeleteEntry(null)}
      />
    </div>
  );
}
