import { SlidersHorizontal } from 'lucide-react';
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

const UNSET_VALUE = '__unset__';

type DroidEnumSettingKey = 'reasoningEffort' | 'autonomyLevel' | 'diffMode';
type DroidBooleanSettingKey =
  | 'todoEnabled'
  | 'todoAutoRefresh'
  | 'autoCompactEnabled'
  | 'soundEnabled';
type DroidNumberSettingKey = 'maxTurns' | 'maxToolCalls' | 'autoCompactThreshold';

export interface DroidQuickSettingsValues {
  reasoningEffort: string | null;
  autonomyLevel: string | null;
  diffMode: string | null;
  maxTurns: number | null;
  maxToolCalls: number | null;
  autoCompactThreshold: number | null;
  todoEnabled: boolean | null;
  todoAutoRefresh: boolean | null;
  autoCompactEnabled: boolean | null;
  soundEnabled: boolean | null;
}

interface DroidSettingsQuickControlsCardProps {
  values: DroidQuickSettingsValues;
  disabled: boolean;
  disabledReason?: string | null;
  onEnumSettingChange: (key: DroidEnumSettingKey, value: string | null) => void;
  onBooleanSettingChange: (key: DroidBooleanSettingKey, value: boolean | null) => void;
  onNumberSettingChange: (key: DroidNumberSettingKey, value: number | null) => void;
}

const enumFieldConfig: Array<{
  key: DroidEnumSettingKey;
  label: string;
  description: string;
  options: Array<{ value: string; label: string }>;
}> = [
  {
    key: 'reasoningEffort',
    label: 'Reasoning Effort',
    description: 'none | medium | high | max',
    options: [
      { value: 'none', label: 'none' },
      { value: 'medium', label: 'medium' },
      { value: 'high', label: 'high' },
      { value: 'max', label: 'max' },
    ],
  },
  {
    key: 'autonomyLevel',
    label: 'Autonomy Level',
    description: 'suggest | aggressive | full',
    options: [
      { value: 'suggest', label: 'suggest' },
      { value: 'aggressive', label: 'aggressive' },
      { value: 'full', label: 'full' },
    ],
  },
  {
    key: 'diffMode',
    label: 'Diff Mode',
    description: 'auto | none | inline | split',
    options: [
      { value: 'auto', label: 'auto' },
      { value: 'none', label: 'none' },
      { value: 'inline', label: 'inline' },
      { value: 'split', label: 'split' },
    ],
  },
];

const booleanFieldConfig: Array<{
  key: DroidBooleanSettingKey;
  label: string;
}> = [
  { key: 'todoEnabled', label: 'Todo Enabled' },
  { key: 'todoAutoRefresh', label: 'Todo Auto Refresh' },
  { key: 'autoCompactEnabled', label: 'Auto Compact Enabled' },
  { key: 'soundEnabled', label: 'Sound Enabled' },
];

const numberFieldConfig: Array<{
  key: DroidNumberSettingKey;
  label: string;
  min: number;
  step: number;
}> = [
  { key: 'maxTurns', label: 'Max Turns', min: 1, step: 1 },
  { key: 'maxToolCalls', label: 'Max Tool Calls', min: 1, step: 1 },
  { key: 'autoCompactThreshold', label: 'Auto Compact Threshold', min: 1000, step: 1000 },
];

function toBooleanSelectValue(value: boolean | null): string {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return UNSET_VALUE;
}

function toBooleanValue(value: string): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

export function DroidSettingsQuickControlsCard({
  values,
  disabled,
  disabledReason,
  onEnumSettingChange,
  onBooleanSettingChange,
  onNumberSettingChange,
}: DroidSettingsQuickControlsCardProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          {t('droidSettings.quickControls')}
          <Badge variant="outline" className="text-[10px] font-normal">
            settings.json
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {disabledReason && <p className="text-xs text-amber-600">{disabledReason}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          {enumFieldConfig.map((field) => (
            <div key={field.key} className="space-y-1">
              {/* TODO i18n: missing keys for droidSettings enum/boolean/number field labels */}
              <p className="text-xs font-medium">{field.label}</p>
              <Select
                value={values[field.key] ?? UNSET_VALUE}
                onValueChange={(next) =>
                  onEnumSettingChange(field.key, next === UNSET_VALUE ? null : next)
                }
                disabled={disabled}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder={t('codex.useDefault')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET_VALUE}>{t('codex.useDefault')}</SelectItem>
                  {field.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{field.description}</p>
            </div>
          ))}

          {numberFieldConfig.map((field) => (
            <div key={field.key} className="space-y-1">
              {/* TODO i18n: missing keys for droidSettings number field labels */}
              <p className="text-xs font-medium">{field.label}</p>
              <Input
                type="number"
                min={field.min}
                step={field.step}
                value={values[field.key] ?? ''}
                onChange={(event) => {
                  const nextRaw = event.target.value.trim();
                  if (!nextRaw) {
                    onNumberSettingChange(field.key, null);
                    return;
                  }
                  const next = Number.parseInt(nextRaw, 10);
                  if (!Number.isFinite(next)) return;
                  onNumberSettingChange(field.key, Math.max(field.min, next));
                }}
                className="h-8 text-xs"
                disabled={disabled}
              />
            </div>
          ))}

          {booleanFieldConfig.map((field) => (
            <div key={field.key} className="space-y-1">
              {/* TODO i18n: missing keys for droidSettings boolean field labels */}
              <p className="text-xs font-medium">{field.label}</p>
              <Select
                value={toBooleanSelectValue(values[field.key])}
                onValueChange={(next) => onBooleanSettingChange(field.key, toBooleanValue(next))}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder={t('codex.useDefault')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET_VALUE}>{t('codex.useDefault')}</SelectItem>
                  <SelectItem value="true">true</SelectItem>
                  <SelectItem value="false">false</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
