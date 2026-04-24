import { BrainCircuit } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DROID_REASONING_EFFORT_OPTIONS,
  type DroidByokModelView,
} from '@/lib/droid-byok-custom-models';

const UNSET_VALUE = '__unset__';

interface DroidByokReasoningControlsCardProps {
  models: DroidByokModelView[];
  disabled: boolean;
  disabledReason?: string | null;
  onEffortChange: (modelId: string, effort: string | null) => void;
  onAnthropicBudgetChange: (modelId: string, budgetTokens: number | null) => void;
}

function getReasoningPathHint(model: DroidByokModelView): string {
  if (model.providerKind === 'openai') return 'Writes: extraArgs.reasoning.effort';
  if (model.providerKind === 'anthropic') {
    return 'Writes: extraArgs.thinking.{type,budget_tokens}';
  }
  return 'Writes: extraArgs.reasoning_effort';
}

export function DroidByokReasoningControlsCard({
  models,
  disabled,
  disabledReason,
  onEffortChange,
  onAnthropicBudgetChange,
}: DroidByokReasoningControlsCardProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BrainCircuit className="h-4 w-4" />
          {t('droidSettings.reasoningControls')}
          <Badge variant="outline" className="text-[10px] font-normal">
            customModels
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {disabledReason && <p className="text-xs text-amber-600">{disabledReason}</p>}

        {models.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {/* TODO i18n: missing key droidSettings.noByokModels */}
            No BYOK custom models found in settings.json (`customModels` or `custom_models`).
          </p>
        ) : (
          <div className="space-y-2">
            {models.map((model) => (
              <div key={model.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{model.displayName}</p>
                    <p className="text-[11px] font-mono text-muted-foreground truncate">
                      {model.model || '(missing model id)'}
                    </p>
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                    {model.provider}
                  </Badge>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium">
                      {t('codex.reasoningEffortCapitalized')}
                    </p>
                    <Select
                      value={model.effort ?? UNSET_VALUE}
                      onValueChange={(next) =>
                        onEffortChange(model.id, next === UNSET_VALUE ? null : next)
                      }
                      disabled={disabled}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        {/* TODO i18n: missing key droidSettings.useProviderDefault */}
                        <SelectValue placeholder="Use provider default" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* TODO i18n: missing key droidSettings.useProviderDefault */}
                        <SelectItem value={UNSET_VALUE}>Use provider default</SelectItem>
                        {DROID_REASONING_EFFORT_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {model.providerKind === 'anthropic' && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium">{t('codex.thinkingBudgetTokens')}</p>
                      <Input
                        type="number"
                        min={1024}
                        step={1024}
                        value={model.anthropicBudgetTokens ?? ''}
                        placeholder="auto"
                        className="h-8 text-xs"
                        disabled={disabled}
                        onChange={(event) => {
                          const raw = event.target.value.trim();
                          if (!raw) {
                            onAnthropicBudgetChange(model.id, null);
                            return;
                          }
                          const parsed = Number.parseInt(raw, 10);
                          if (!Number.isFinite(parsed)) return;
                          onAnthropicBudgetChange(model.id, Math.max(1024, parsed));
                        }}
                      />
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-muted-foreground">{getReasoningPathHint(model)}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
