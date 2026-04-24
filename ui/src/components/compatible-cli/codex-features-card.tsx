import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import type { CodexFeatureCatalogEntry } from '@/lib/codex-config';
import { CodexConfigCardShell } from './codex-config-card-shell';

interface CodexFeaturesCardProps {
  catalog: CodexFeatureCatalogEntry[];
  state: Record<string, boolean | null>;
  disabled?: boolean;
  disabledReason?: string | null;
  onToggle: (feature: string, enabled: boolean | null) => Promise<void> | void;
}

export function CodexFeaturesCard({
  catalog,
  state,
  disabled = false,
  disabledReason,
  onToggle,
}: CodexFeaturesCardProps) {
  const { t } = useTranslation();

  const knownFeatureNames = new Set(catalog.map((feature) => feature.name));
  const configOnlyFeatures = Object.entries(state)
    .filter(([name]) => !knownFeatureNames.has(name))
    .sort(([left], [right]) => left.localeCompare(right));

  return (
    <CodexConfigCardShell
      title={t('codex.features')}
      badge="features"
      icon={<Sparkles className="h-4 w-4" />}
      description={t('codex.featuresDesc')}
      disabledReason={disabledReason}
    >
      <div className="space-y-2">
        {catalog.map((feature) => {
          const current = state[feature.name] ?? null;
          return (
            <div
              key={feature.name}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{feature.label}</p>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {feature.name}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </div>
              <div className="flex items-center gap-2">
                {current !== null ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onToggle(feature.name, null)}
                    disabled={disabled}
                  >
                    {t('codex.useDefault')}
                  </Button>
                ) : null}
                <Switch
                  checked={current === true}
                  onCheckedChange={(next) => onToggle(feature.name, next)}
                  disabled={disabled}
                />
              </div>
            </div>
          );
        })}
      </div>

      {configOnlyFeatures.length > 0 ? (
        <div className="space-y-2">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('codex.configOnlyFlags')}
            </p>
            <p className="text-xs text-muted-foreground">{t('codex.configOnlyFlagsDesc')}</p>
          </div>
          {configOnlyFeatures.map(([name, current]) => (
            <div
              key={name}
              className="flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{name}</p>
                  <Badge variant="secondary" className="text-[10px]">
                    {t('codex.existing')}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {current === null ? t('codex.nonBooleanForm') : t('codex.discoveredFromFile')}
                </p>
              </div>
              {current === null ? (
                <Badge variant="outline">{t('codex.rawOnly')}</Badge>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onToggle(name, null)}
                    disabled={disabled}
                  >
                    {t('codex.useDefault')}
                  </Button>
                  <Switch
                    checked={current === true}
                    onCheckedChange={(next) => onToggle(name, next)}
                    disabled={disabled}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </CodexConfigCardShell>
  );
}
