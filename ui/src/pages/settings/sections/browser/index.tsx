import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Browser,
  Gear,
  CheckCircle,
  WarningCircle,
  XCircle,
  ArrowRight,
  ClipboardText,
  ArrowsClockwise,
  TerminalWindow,
  CaretDown,
  Info,
} from '@phosphor-icons/react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { getClientPlatformKey } from '@/lib/platform';
import { cn } from '@/lib/utils';
import { useBrowserConfig, useRawConfig } from '../../hooks';
import type { BrowserConfig } from '../../types';

// --- Constants & Helpers ---

function parsePortDraft(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const port = Number.parseInt(value.trim(), 10);
  if (port < 1 || port > 65535) return null;
  return port;
}

function buildLaunchCommand(
  userDataDir: string,
  devtoolsPort: number,
  platform: 'darwin' | 'linux' | 'win32'
): string {
  const quotedPath = JSON.stringify(userDataDir);
  if (platform === 'darwin') {
    return `open -na "Google Chrome" --args --remote-debugging-port=${devtoolsPort} --user-data-dir=${quotedPath}`;
  }
  if (platform === 'win32') {
    return `chrome.exe --remote-debugging-port=${devtoolsPort} --user-data-dir=${quotedPath}`;
  }
  return `google-chrome --remote-debugging-port=${devtoolsPort} --user-data-dir=${quotedPath}`;
}

// --- High-End Components ---

/**
 * Double-Bezel Card Pattern
 * Machined hardware look with nested enclosures
 */
function DoubleBezelCard({
  children,
  className,
  title,
  description,
  badge,
  action,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-[2.5rem] border border-border/60 bg-muted/20 p-1.5 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] dark:border-white/[0.08] dark:bg-zinc-900/35',
        className
      )}
    >
      <div className="relative overflow-hidden rounded-[calc(2.5rem-0.375rem)] border border-border/70 bg-card/90 shadow-[0_12px_36px_-18px_rgba(15,23,42,0.18)] dark:border-white/[0.08] dark:bg-zinc-900/70 dark:shadow-[0_18px_44px_-24px_rgba(0,0,0,0.55)]">
        {/* Subtle highlight inner shadow */}
        <div className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" />

        {(title || action) && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 px-8 py-6 dark:border-white/[0.06]">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
                {badge}
              </div>
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
            {action && <div className="flex items-center gap-2">{action}</div>}
          </div>
        )}
        <div className="px-8 py-8">{children}</div>
      </div>
    </div>
  );
}

/**
 * Animated Status Strip
 * Highlights readiness with cinematic dynamics
 */
function StatusStrip({
  state,
  title,
  detail,
  nextStep,
}: {
  state: string;
  title: string;
  detail: string;
  nextStep: string;
}) {
  const { t } = useTranslation();
  const isReady = state === 'ready' || state === 'enabled';
  const isError = !isReady && state !== 'disabled';

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border p-4 transition-all duration-500',
        isReady
          ? 'border-emerald-500/20 bg-emerald-500/[0.03] dark:bg-emerald-500/[0.02]'
          : isError
            ? 'border-amber-500/20 bg-amber-500/[0.03] dark:bg-amber-500/[0.02]'
            : 'border-border/60 bg-muted/30 dark:border-white/[0.06] dark:bg-zinc-900/45'
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-500 group-hover:scale-110',
            isReady
              ? 'bg-emerald-500/10 text-emerald-600'
              : isError
                ? 'bg-amber-500/10 text-amber-600'
                : 'bg-slate-500/10 text-slate-500'
          )}
        >
          {isReady ? (
            <CheckCircle weight="duotone" size={24} />
          ) : isError ? (
            <WarningCircle weight="duotone" size={24} />
          ) : (
            <XCircle weight="duotone" size={24} />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/60">
              {t('settingsPage.browserSection.readiness')}
            </span>
            {isReady && (
              <motion.span
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="h-1.5 w-1.5 rounded-full bg-emerald-500"
              />
            )}
          </div>
          <h4 className="font-medium text-foreground">{title}</h4>
          <p className="text-sm leading-relaxed text-muted-foreground">{detail}</p>
          {nextStep && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-border/50 bg-muted/35 p-3 dark:border-white/[0.05] dark:bg-zinc-900/45">
              <ArrowRight size={14} className="mt-0.5 shrink-0 text-primary" />
              <p className="text-xs leading-normal">
                <span className="font-semibold text-primary">
                  {t('settingsPage.browserSection.nextStep')}:
                </span>{' '}
                {nextStep}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Diagnostics Accordion
 * Pushes secondary details lower in the hierarchy
 */
function DiagnosticsSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="overflow-hidden rounded-2xl border border-border/60 bg-muted/20 dark:border-white/[0.06] dark:bg-zinc-900/30"
    >
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center justify-between px-6 py-4 text-sm font-medium transition-colors hover:bg-muted/40 dark:hover:bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <Gear size={16} weight="bold" className="text-muted-foreground" />
            {title}
          </div>
          <CaretDown
            size={16}
            className={cn('transition-transform duration-300', isOpen && 'rotate-180')}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border/60 px-6 py-6 dark:border-white/[0.06]">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// --- Main Section ---

export default function BrowserSection() {
  const { t } = useTranslation();
  const { fetchRawConfig } = useRawConfig();
  const {
    config,
    status,
    loading,
    statusLoading,
    saving,
    error,
    success,
    fetchConfig,
    fetchStatus,
    saveConfig,
  } = useBrowserConfig();

  const [draft, setDraft] = useState<BrowserConfig | null>(null);
  const [claudePortDraft, setClaudePortDraft] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (!actionMessage && !success) return;
    const timer = window.setTimeout(() => setActionMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [actionMessage, success]);

  const effectiveConfig = draft ?? config;
  const preferredLaunchCommand = useMemo(() => {
    if (!effectiveConfig) return '';
    return buildLaunchCommand(
      effectiveConfig.claude.userDataDir,
      effectiveConfig.claude.devtoolsPort,
      getClientPlatformKey()
    );
  }, [effectiveConfig]);

  const displayedClaudePort =
    claudePortDraft ?? String(effectiveConfig?.claude.devtoolsPort ?? 9222);
  const claudePort = parsePortDraft(displayedClaudePort);
  const claudePortInvalid = displayedClaudePort.trim().length > 0 && claudePort === null;

  const hasClaudeChanges =
    config !== null &&
    effectiveConfig !== null &&
    (config.claude.enabled !== effectiveConfig.claude.enabled ||
      config.claude.userDataDir !== effectiveConfig.claude.userDataDir ||
      config.claude.devtoolsPort !== claudePort);
  const hasCodexChanges =
    config !== null &&
    effectiveConfig !== null &&
    config.codex.enabled !== effectiveConfig.codex.enabled;

  const refreshAll = useCallback(async () => {
    setActionMessage(null);
    setDraft(null);
    setClaudePortDraft(null);
    await Promise.all([fetchConfig(), fetchRawConfig()]);
  }, [fetchConfig, fetchRawConfig]);

  const refreshStatus = useCallback(async () => {
    const nextStatus = await fetchStatus();
    if (nextStatus) {
      setActionMessage(t('settingsPage.browserSection.messages.statusRefreshed'));
    }
  }, [fetchStatus, t]);

  const saveClaudeSettings = useCallback(async () => {
    if (!effectiveConfig || claudePort === null) return;
    const saved = await saveConfig({
      claude: {
        enabled: effectiveConfig.claude.enabled,
        userDataDir: effectiveConfig.claude.userDataDir.trim(),
        devtoolsPort: claudePort,
      },
    });
    if (saved) {
      await fetchRawConfig();
      setActionMessage(null);
      setDraft(null);
      setClaudePortDraft(null);
    }
  }, [claudePort, effectiveConfig, fetchRawConfig, saveConfig]);

  const saveCodexSettings = useCallback(async () => {
    if (!effectiveConfig) return;
    const saved = await saveConfig({
      codex: {
        enabled: effectiveConfig.codex.enabled,
      },
    });
    if (saved) {
      await fetchRawConfig();
      setActionMessage(null);
      setDraft(null);
      setClaudePortDraft(null);
    }
  }, [effectiveConfig, fetchRawConfig, saveConfig]);

  const copyLaunchCommand = useCallback(async () => {
    if (!preferredLaunchCommand) return;
    await navigator.clipboard.writeText(preferredLaunchCommand);
    setActionMessage(t('settingsPage.browserSection.messages.launchCommandCopied'));
  }, [preferredLaunchCommand, t]);

  // -- Render Helpers --

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          >
            <ArrowsClockwise size={32} />
          </motion.div>
          <span className="text-sm font-medium uppercase tracking-widest opacity-60">
            {t('settings.loading')}
          </span>
        </div>
      </div>
    );
  }

  if (!config || !status || !effectiveConfig) {
    return (
      <div className="p-8">
        <Alert variant="destructive" className="rounded-[2rem] p-8 shadow-xl">
          <XCircle weight="duotone" size={24} />
          <AlertDescription className="mt-2 text-md leading-relaxed">
            {error ?? t('settingsPage.browserSection.description')}
          </AlertDescription>
          <div className="mt-6">
            <Button
              variant="outline"
              className="rounded-full px-6 transition-transform active:scale-95"
              onClick={refreshAll}
            >
              <ArrowsClockwise className="mr-2 h-4 w-4" />
              {t('sharedPage.retry')}
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Toast Notification Surface */}
      <AnimatePresence>
        {(error || success || actionMessage) && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="absolute left-1/2 top-6 z-50 -translate-x-1/2"
          >
            {error ? (
              <div className="flex items-center gap-3 rounded-full border border-rose-500/20 bg-card/95 px-6 py-2.5 text-sm font-medium text-rose-600 shadow-2xl dark:bg-zinc-900/85">
                <XCircle size={18} weight="bold" />
                {error}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-full border border-emerald-500/20 bg-card/95 px-6 py-2.5 text-sm font-medium text-emerald-600 shadow-2xl dark:bg-zinc-900/85">
                <CheckCircle size={18} weight="bold" />
                {actionMessage ?? t('commonToast.settingsSaved')}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-[1240px] space-y-12 p-8 py-16">
          {/* Header Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap items-end justify-between gap-6"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Browser weight="duotone" size={28} />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">
                    {t('settingsPage.browserSection.title')}
                  </h1>
                  <p className="mt-1 text-muted-foreground">
                    {t('settingsPage.browserSection.description')}
                  </p>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              className="rounded-full border-border/70 bg-background/85 shadow-sm transition-all hover:bg-muted/50 active:scale-95 dark:border-white/[0.08] dark:bg-zinc-900/70 dark:hover:bg-zinc-900"
              onClick={refreshAll}
              disabled={saving || loading}
            >
              <ArrowsClockwise className={cn('mr-2 h-4 w-4', statusLoading && 'animate-spin')} />
              {t('settings.refresh')}
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Alert className="items-center rounded-3xl border-primary/10 bg-primary/[0.04] p-6 py-4 dark:border-primary/15 dark:bg-primary/[0.05]">
              <Info className="h-5 w-5 text-primary" weight="duotone" />
              <AlertDescription className="ml-2 text-sm">
                <span className="font-semibold text-primary/80">
                  {t('settingsPage.browserSection.primaryTitle')}
                </span>{' '}
                {t('settingsPage.browserSection.primaryDescription')}
              </AlertDescription>
            </Alert>
          </motion.div>

          {/* Claude Lane Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <DoubleBezelCard
              title={t('settingsPage.browserSection.claude.title')}
              description={t('settingsPage.browserSection.claude.description')}
              action={
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 rounded-full border border-border/60 bg-muted/30 px-4 py-2 dark:border-white/[0.06] dark:bg-zinc-900/45">
                    <Label
                      htmlFor="browser-claude-enabled"
                      className="cursor-pointer text-xs font-semibold leading-none"
                    >
                      {effectiveConfig.claude.enabled ? 'ENABLED' : 'DISABLED'}
                    </Label>
                    <Switch
                      id="browser-claude-enabled"
                      checked={effectiveConfig.claude.enabled}
                      onCheckedChange={(next) =>
                        setDraft((current) =>
                          updateClaudeDraft(current ?? effectiveConfig, { enabled: next })
                        )
                      }
                    />
                  </div>
                  <Button
                    onClick={saveClaudeSettings}
                    disabled={saving || claudePortInvalid || !hasClaudeChanges}
                    className="rounded-full px-6 shadow-md transition-transform active:scale-95"
                  >
                    {saving ? (
                      <ArrowsClockwise className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle weight="bold" size={16} className="mr-2" />
                    )}
                    {t('settingsPage.browserSection.actions.saveClaude')}
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full border-border/70 bg-background/85 shadow-sm transition-all hover:bg-muted/50 active:scale-95 dark:border-white/[0.08] dark:bg-zinc-900/70 dark:hover:bg-zinc-900"
                    onClick={refreshStatus}
                    disabled={saving || statusLoading || hasClaudeChanges || claudePortInvalid}
                  >
                    <TerminalWindow weight="bold" size={16} className="mr-2" />
                    {t('settingsPage.browserSection.actions.testConnection')}
                  </Button>
                </div>
              }
            >
              <div className="grid gap-12">
                <StatusStrip
                  state={status.claude.state}
                  title={status.claude.title}
                  detail={status.claude.detail}
                  nextStep={status.claude.nextStep}
                />

                <div className="grid gap-8 lg:grid-cols-2">
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <Label
                        htmlFor="browser-claude-user-data-dir"
                        className="text-sm font-semibold tracking-wide text-muted-foreground/80"
                      >
                        {t('settingsPage.browserSection.claude.userDataDir')}
                      </Label>
                      <Input
                        id="browser-claude-user-data-dir"
                        value={effectiveConfig.claude.userDataDir}
                        onChange={(event) =>
                          setDraft((current) =>
                            updateClaudeDraft(current ?? effectiveConfig, {
                              userDataDir: event.target.value,
                            })
                          )
                        }
                        className="rounded-xl border-border/70 bg-background/85 dark:border-white/[0.08] dark:bg-zinc-900/70"
                        placeholder={status.claude.recommendedUserDataDir}
                      />
                      <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                        {t('settingsPage.browserSection.claude.userDataDirHint')}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <Label
                        htmlFor="browser-claude-devtools-port"
                        className="text-sm font-semibold tracking-wide text-muted-foreground/80"
                      >
                        {t('settingsPage.browserSection.claude.devtoolsPort')}
                      </Label>
                      <Input
                        id="browser-claude-devtools-port"
                        value={displayedClaudePort}
                        onChange={(event) => setClaudePortDraft(event.target.value)}
                        inputMode="numeric"
                        className="max-w-[120px] rounded-xl border-border/70 bg-background/85 dark:border-white/[0.08] dark:bg-zinc-900/70"
                      />
                      <p
                        className={cn(
                          'text-[11px] leading-relaxed text-muted-foreground/70',
                          claudePortInvalid && 'text-rose-500'
                        )}
                      >
                        {claudePortInvalid
                          ? t('settingsPage.browserSection.claude.devtoolsPortInvalid')
                          : t('settingsPage.browserSection.claude.devtoolsPortHint')}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="group/launch relative overflow-hidden rounded-2xl border border-border/60 bg-muted/20 p-5 transition-all hover:bg-muted/35 dark:border-white/[0.06] dark:bg-zinc-900/35 dark:hover:bg-zinc-900/50">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary/70">
                            {t('settingsPage.browserSection.claude.launchGuidance')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t('settingsPage.browserSection.claude.launchGuidanceHint')}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 rounded-full p-0 transition-transform active:scale-90"
                          onClick={copyLaunchCommand}
                          disabled={!preferredLaunchCommand}
                        >
                          <ClipboardText size={18} />
                        </Button>
                      </div>
                      <code className="mt-4 block break-all rounded-lg border border-border/50 bg-background/80 p-3 font-mono text-[10px] leading-relaxed dark:border-white/[0.05] dark:bg-zinc-900/60">
                        {preferredLaunchCommand}
                      </code>
                    </div>

                    {status.claude.overrideActive && (
                      <div className="flex items-center gap-3 rounded-2xl border border-amber-500/10 bg-amber-500/[0.05] p-4 text-xs font-medium text-amber-700 dark:text-amber-300">
                        <WarningCircle size={18} weight="duotone" />
                        {t('settingsPage.browserSection.claude.overrideMessage', {
                          source: status.claude.source,
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <DiagnosticsSection
                  title={t('settingsPage.browserSection.technicalDetails')}
                  defaultOpen={status.claude.state !== 'ready'}
                >
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                        {t('settingsPage.browserSection.claude.effectivePath')}
                      </p>
                      <div className="rounded-lg border border-border/50 bg-muted/25 p-3 dark:border-white/[0.05] dark:bg-zinc-900/45">
                        <p className="break-all font-mono text-[11px] leading-relaxed">
                          {status.claude.effectiveUserDataDir}
                        </p>
                      </div>
                      <p className="text-[10px] font-medium text-muted-foreground/60">
                        <span className="font-bold">
                          {t('settingsPage.browserSection.claude.recommendedPath')}:
                        </span>{' '}
                        {status.claude.recommendedUserDataDir}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                        {t('settingsPage.browserSection.claude.managedRuntime')}
                      </p>
                      <div className="rounded-lg border border-border/50 bg-muted/25 p-3 dark:border-white/[0.05] dark:bg-zinc-900/45">
                        <p className="font-semibold text-primary/80">
                          {status.claude.managedMcpServerName}
                        </p>
                        <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-muted-foreground/80">
                          {status.claude.managedMcpServerPath}
                        </p>
                      </div>
                    </div>
                  </div>
                </DiagnosticsSection>
              </div>
            </DoubleBezelCard>
          </motion.div>

          {/* Codex Lane Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <DoubleBezelCard
              title={t('settingsPage.browserSection.codex.title')}
              description={t('settingsPage.browserSection.codex.description')}
              action={
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 rounded-full border border-border/60 bg-muted/30 px-4 py-2 dark:border-white/[0.06] dark:bg-zinc-900/45">
                    <Label
                      htmlFor="browser-codex-enabled"
                      className="cursor-pointer text-xs font-semibold leading-none"
                    >
                      {effectiveConfig.codex.enabled ? 'ENABLED' : 'DISABLED'}
                    </Label>
                    <Switch
                      id="browser-codex-enabled"
                      checked={effectiveConfig.codex.enabled}
                      onCheckedChange={(next) =>
                        setDraft((current) =>
                          updateCodexDraft(current ?? effectiveConfig, { enabled: next })
                        )
                      }
                    />
                  </div>
                  <Button
                    onClick={saveCodexSettings}
                    disabled={saving || !hasCodexChanges}
                    className="rounded-full px-6 shadow-md transition-transform active:scale-95"
                  >
                    {saving ? (
                      <ArrowsClockwise className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle weight="bold" size={16} className="mr-2" />
                    )}
                    {t('settingsPage.browserSection.actions.saveCodex')}
                  </Button>
                </div>
              }
            >
              <div className="grid gap-12">
                <StatusStrip
                  state={status.codex.state}
                  title={status.codex.title}
                  detail={status.codex.detail}
                  nextStep={status.codex.nextStep}
                />

                <DiagnosticsSection
                  title={t('settingsPage.browserSection.technicalDetails')}
                  defaultOpen={status.codex.state === 'unsupported_build'}
                >
                  <div className="grid gap-6 sm:grid-cols-3">
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                        {t('settingsPage.browserSection.codex.serverName')}
                      </p>
                      <div className="rounded-lg border border-border/50 bg-muted/25 p-3 dark:border-white/[0.05] dark:bg-zinc-900/45">
                        <p className="font-mono text-[11px] font-semibold">
                          {status.codex.serverName}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                        {t('settingsPage.browserSection.codex.overrideSupport')}
                      </p>
                      <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/25 p-3 font-medium text-xs dark:border-white/[0.05] dark:bg-zinc-900/45">
                        {status.codex.supportsConfigOverrides ? (
                          <CheckCircle className="text-emerald-500" size={16} weight="bold" />
                        ) : (
                          <XCircle className="text-rose-500" size={16} weight="bold" />
                        )}
                        {status.codex.supportsConfigOverrides
                          ? t('settingsPage.browserSection.codex.overrideSupported')
                          : t('settingsPage.browserSection.codex.overrideUnsupported')}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                        {t('settingsPage.browserSection.codex.binary')}
                      </p>
                      <div className="rounded-lg border border-border/50 bg-muted/25 p-3 dark:border-white/[0.05] dark:bg-zinc-900/45">
                        <p className="break-all font-mono text-[11px] leading-relaxed">
                          {status.codex.binaryPath ??
                            t('settingsPage.browserSection.codex.notDetected')}
                        </p>
                        {status.codex.version && (
                          <div className="mt-2 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                            {status.codex.version}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </DiagnosticsSection>
              </div>
            </DoubleBezelCard>
          </motion.div>
        </div>
      </ScrollArea>
    </div>
  );
}

function updateClaudeDraft(
  source: BrowserConfig,
  updates: Partial<BrowserConfig['claude']>
): BrowserConfig {
  return {
    ...source,
    claude: {
      ...source.claude,
      ...updates,
    },
  };
}

function updateCodexDraft(
  source: BrowserConfig,
  updates: Partial<BrowserConfig['codex']>
): BrowserConfig {
  return {
    ...source,
    codex: {
      ...source.codex,
      ...updates,
    },
  };
}
