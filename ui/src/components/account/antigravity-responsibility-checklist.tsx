import { AlertTriangle, ExternalLink, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { ANTIGRAVITY_ACK_PHRASE } from '@/components/account/antigravity-responsibility-constants';
import type { AntigravityRiskChecklistValue } from '@/components/account/antigravity-responsibility-constants';

interface AntigravityResponsibilityChecklistProps {
  className?: string;
  value: AntigravityRiskChecklistValue;
  onChange: (value: AntigravityRiskChecklistValue) => void;
  disabled?: boolean;
}

export function AntigravityResponsibilityChecklist({
  className,
  value,
  onChange,
  disabled = false,
}: AntigravityResponsibilityChecklistProps) {
  const { t } = useTranslation();
  const completedSteps = [
    value.reviewedIssue509,
    value.understandsBanRisk,
    value.acceptsFullResponsibility,
    value.typedPhrase.trim().replace(/\s+/g, ' ').toUpperCase() === ANTIGRAVITY_ACK_PHRASE,
  ].filter(Boolean).length;
  const progressValue = (completedSteps / 4) * 100;

  const setValue = (next: Partial<AntigravityRiskChecklistValue>) => {
    onChange({ ...value, ...next });
  };

  return (
    <section
      role="alert"
      className={cn(
        'relative overflow-hidden rounded-xl border border-rose-500/35 bg-gradient-to-br from-rose-50 via-background to-amber-50/70 p-4 shadow-sm dark:from-rose-950/20 dark:to-amber-950/20',
        className
      )}
    >
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-rose-500 via-orange-500 to-amber-500" />

      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold leading-5">{t('antigravityChecklist.title')}</p>
              <p className="text-xs text-muted-foreground">{t('antigravityChecklist.subtitle')}</p>
            </div>
          </div>
          <Badge variant="outline" className="border-rose-500/40 text-rose-700 dark:text-rose-300">
            {t('antigravityChecklist.mandatory')}
          </Badge>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('antigravityChecklist.completion')}</span>
            <span>{t('antigravityChecklist.stepsCount', { current: completedSteps })}</span>
          </div>
          <Progress value={progressValue} className="h-2" />
        </div>

        <div className="space-y-3 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
          <div className="flex items-start gap-2">
            <Checkbox
              id="agy-step-reviewed-issue"
              checked={value.reviewedIssue509}
              onCheckedChange={(checked) => setValue({ reviewedIssue509: Boolean(checked) })}
              disabled={disabled}
            />
            <Label htmlFor="agy-step-reviewed-issue" className="text-xs leading-5">
              {/* TODO i18n: missing key for step 1 */}
              Step 1: I reviewed issue #509 and understand AGY OAuth can trigger account
              bans/suspensions.
            </Label>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="agy-step-understands-risk"
              checked={value.understandsBanRisk}
              onCheckedChange={(checked) => setValue({ understandsBanRisk: Boolean(checked) })}
              disabled={disabled}
            />
            <Label htmlFor="agy-step-understands-risk" className="text-xs leading-5">
              {/* TODO i18n: missing key for step 2 */}
              Step 2: I understand this OAuth action is my own decision and I accept the upstream
              risk.
            </Label>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="agy-step-accept-responsibility"
              checked={value.acceptsFullResponsibility}
              onCheckedChange={(checked) =>
                setValue({ acceptsFullResponsibility: Boolean(checked) })
              }
              disabled={disabled}
            />
            <Label htmlFor="agy-step-accept-responsibility" className="text-xs leading-5">
              {/* TODO i18n: missing key for step 3 */}
              Step 3: I accept full responsibility. CCS is not liable for suspension, bans, or
              access loss.
            </Label>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-200">
            <ShieldAlert className="h-3.5 w-3.5" />
            {/* TODO i18n: missing key for step 4 */}
            Step 4: Type exact phrase to continue
          </div>
          <Input
            value={value.typedPhrase}
            onChange={(e) => setValue({ typedPhrase: e.target.value })}
            placeholder={ANTIGRAVITY_ACK_PHRASE}
            disabled={disabled}
            className="font-mono text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <a
            href="https://github.com/kaitranntt/ccs/issues/509"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 font-medium text-rose-800 transition-colors hover:bg-rose-500/15 dark:text-rose-200"
          >
            {/* TODO i18n: missing key */}Read issue #509
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
