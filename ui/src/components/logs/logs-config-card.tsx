import { useEffect, useMemo, useState } from 'react';
import { Save, Settings2, ShieldAlert, RotateCcw, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { LogsConfig, UpdateLogsConfigPayload } from '@/lib/api-client';
import { cn } from '@/lib/utils';

function parseInteger(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.max(0, parsed);
}

export function LogsConfigCard({
  config,
  onSave,
  isPending,
}: {
  config: LogsConfig;
  onSave: (payload: UpdateLogsConfigPayload) => void;
  isPending: boolean;
}) {
  const [draft, setDraft] = useState(config);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(config), [config, draft]);

  return (
    <div className="group relative overflow-hidden rounded-2xl border-2 border-border/60 bg-card/40 p-1 shadow-lg transition-all hover:border-border">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/5 border border-primary/20">
            <Settings2 className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="space-y-0.5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
              Logging Policy
            </h3>
            <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-foreground/45">
              Retention and privacy
            </p>
          </div>
        </div>
        <div
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            config.enabled ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-zinc-500'
          )}
        />
      </div>

      <div className="space-y-6 p-5">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border/40 bg-background/50 p-3 flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
              Active Status
            </span>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'text-[11px] font-semibold uppercase tracking-[0.1em]',
                  config.enabled ? 'text-emerald-500' : 'text-zinc-500'
                )}
              >
                {config.enabled ? 'Live' : 'Off'}
              </span>
            </div>
          </div>
          <div className="rounded-xl border border-border/40 bg-background/50 p-3 flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
              Redaction
            </span>
            <span
              className={cn(
                'text-[11px] font-semibold uppercase tracking-[0.1em]',
                config.redact ? 'text-primary' : 'text-muted-foreground/40'
              )}
            >
              {config.redact ? 'Enforced' : 'Plain'}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/40 bg-background/20 px-4 py-3 transition-colors hover:bg-background/40">
            <div className="space-y-0.5">
              <Label
                htmlFor="logs-enabled"
                className="text-[12px] font-semibold uppercase tracking-[0.12em]"
              >
                Pipeline
              </Label>
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/55">
                Enable structured logging
              </p>
            </div>
            <Switch
              id="logs-enabled"
              checked={draft.enabled}
              onCheckedChange={(checked) =>
                setDraft((current) => ({ ...current, enabled: checked }))
              }
              className="data-[state=checked]:bg-primary"
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/40 bg-background/20 px-4 py-3 transition-colors hover:bg-background/40">
            <div className="space-y-0.5">
              <Label
                htmlFor="logs-redact"
                className="text-[12px] font-semibold uppercase tracking-[0.12em]"
              >
                Masking
              </Label>
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/55">
                Sanitize payload data
              </p>
            </div>
            <Switch
              id="logs-redact"
              checked={draft.redact}
              onCheckedChange={(checked) =>
                setDraft((current) => ({ ...current, redact: checked }))
              }
              className="data-[state=checked]:bg-primary"
            />
          </div>
        </div>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <ShieldAlert className="h-3 w-3 text-primary/40" />
              <Label
                htmlFor="logs-config-level"
                className="text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/70"
              >
                Minimum Operational Threshold
              </Label>
            </div>
            <Select
              value={draft.level}
              onValueChange={(value) =>
                setDraft((current) => ({ ...current, level: value as LogsConfig['level'] }))
              }
            >
              <SelectTrigger
                id="logs-config-level"
                className="h-10 rounded-xl border-2 border-border/40 bg-background/50 text-[12px] font-semibold uppercase tracking-[0.1em] focus:ring-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-2 border-border bg-card">
                <SelectItem
                  value="error"
                  className="text-[11px] font-semibold uppercase tracking-[0.1em]"
                >
                  Error Only
                </SelectItem>
                <SelectItem
                  value="warn"
                  className="text-[11px] font-semibold uppercase tracking-[0.1em]"
                >
                  Warn + Above
                </SelectItem>
                <SelectItem
                  value="info"
                  className="text-[11px] font-semibold uppercase tracking-[0.1em]"
                >
                  Info + Above
                </SelectItem>
                <SelectItem
                  value="debug"
                  className="text-[11px] font-semibold uppercase tracking-[0.1em]"
                >
                  Full Debug
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label
                htmlFor="logs-rotate-mb"
                className="px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-foreground/50"
              >
                Rotation (MB)
              </Label>
              <Input
                id="logs-rotate-mb"
                type="number"
                min={1}
                className="h-10 rounded-xl border-2 border-border/40 bg-background/50 font-mono text-[12px] font-medium focus-visible:ring-0"
                value={draft.rotate_mb}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    rotate_mb: parseInteger(event.target.value, current.rotate_mb),
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="logs-retain-days"
                className="px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-foreground/50"
              >
                Retain (Days)
              </Label>
              <Input
                id="logs-retain-days"
                type="number"
                min={1}
                className="h-10 rounded-xl border-2 border-border/40 bg-background/50 font-mono text-[12px] font-medium focus-visible:ring-0"
                value={draft.retain_days}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    retain_days: parseInteger(event.target.value, current.retain_days),
                  }))
                }
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-4 border-t border-border">
          <Button
            onClick={() => onSave(draft)}
            disabled={!isDirty || isPending}
            className="h-10 w-full gap-2 rounded-xl bg-primary text-[11px] font-semibold uppercase tracking-[0.14em] shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Save className="h-3.5 w-3.5" />
            Commit Changes
          </Button>
          <Button
            variant="ghost"
            onClick={() => setDraft(config)}
            disabled={!isDirty || isPending}
            className="h-9 gap-2 text-[10px] font-medium uppercase tracking-[0.12em] text-foreground/45 hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            Rollback Draft
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between bg-muted/20 px-5 py-2">
        <div className="flex items-center gap-1.5">
          <Activity className="h-2.5 w-2.5 text-primary/40" />
          <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-foreground/30">
            Operational Logic v3.4
          </span>
        </div>
        {isDirty && (
          <div className="flex items-center gap-1">
            <div className="h-1 w-1 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-amber-500/70">
              Pending
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
