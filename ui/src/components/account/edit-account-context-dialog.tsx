import { useMemo, useState, type KeyboardEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { Unlink, Link2, Waves, ShieldAlert, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AuthAccountRow, SharedGroupSummary } from '@/lib/account-continuity';
import type { PlainCcsLane } from '@/lib/api-client';
import { useUpdateAccountContext } from '@/hooks/use-accounts';
import { CopyButton } from '@/components/ui/copy-button';

type ContextMode = 'isolated' | 'shared';
type ContinuityMode = 'standard' | 'deeper';

const MAX_CONTEXT_GROUP_LENGTH = 64;
const CONTEXT_GROUP_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

interface EditAccountContextDialogProps {
  account: AuthAccountRow;
  groupSummaries: SharedGroupSummary[];
  plainCcsLane: PlainCcsLane | null;
  onClose: () => void;
}

export function EditAccountContextDialog({
  account,
  groupSummaries,
  plainCcsLane,
  onClose,
}: EditAccountContextDialogProps) {
  const { t } = useTranslation();
  const updateContextMutation = useUpdateAccountContext();
  const [mode, setMode] = useState<ContextMode>(
    account.context_mode === 'shared' ? 'shared' : 'isolated'
  );
  const [group, setGroup] = useState(account.context_group || 'default');
  const [continuityMode, setContinuityMode] = useState<ContinuityMode>(
    account.continuity_mode === 'deeper' ? 'deeper' : 'standard'
  );

  const normalizedGroup = useMemo(() => group.trim().toLowerCase().replace(/\s+/g, '-'), [group]);
  const matchingGroup = useMemo(
    () => groupSummaries.find((summary) => summary.group === normalizedGroup),
    [groupSummaries, normalizedGroup]
  );
  const isSharedGroupValid =
    normalizedGroup.length > 0 &&
    normalizedGroup.length <= MAX_CONTEXT_GROUP_LENGTH &&
    CONTEXT_GROUP_PATTERN.test(normalizedGroup);
  const canSubmit = mode === 'isolated' || isSharedGroupValid;
  const sameGroupPeerCount =
    mode === 'shared'
      ? Math.max(
          (matchingGroup?.sharedCount ?? 0) -
            (account.context_mode === 'shared' && account.context_group === normalizedGroup
              ? 1
              : 0),
          0
        )
      : 0;
  const sameGroupDeeperPeerCount =
    mode === 'shared'
      ? Math.max(
          (matchingGroup?.deeperCount ?? 0) -
            (account.continuity_mode === 'deeper' && account.context_group === normalizedGroup
              ? 1
              : 0),
          0
        )
      : 0;
  const plainLaneUsesThisAccount = plainCcsLane?.account_name === account.name;
  const showPlainLaneMismatch = !!plainCcsLane && !plainLaneUsesThisAccount;
  const defaultCommand = `ccs auth default ${account.name}`;
  const accountBackupCommand = `ccs auth backup ${account.name}`;
  const handleRadioKeyDown = <T extends string>(
    event: KeyboardEvent<HTMLButtonElement>,
    current: T,
    values: readonly T[],
    setValue: (value: T) => void
  ) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const currentIndex = values.indexOf(current);
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const nextIndex = (currentIndex + direction + values.length) % values.length;
    setValue(values[nextIndex] as T);
  };
  const laneLabel = plainCcsLane
    ? plainCcsLane.kind === 'native'
      ? t('continuityOverview.lane.native')
      : plainCcsLane.kind === 'account-default'
        ? t('continuityOverview.lane.accountDefault', {
            name: plainCcsLane.account_name || '',
          })
        : plainCcsLane.kind === 'account-inherited'
          ? t('continuityOverview.lane.accountInherited', {
              name: plainCcsLane.account_name || '',
            })
          : plainCcsLane.kind === 'profile-default'
            ? t('continuityOverview.lane.profileDefault', {
                name: plainCcsLane.profile_name || 'default',
              })
            : plainCcsLane.label
    : '';

  const handleSave = () => {
    if (!canSubmit) {
      return;
    }

    updateContextMutation.mutate(
      {
        name: account.name,
        context_mode: mode,
        context_group: mode === 'shared' ? normalizedGroup : undefined,
        continuity_mode: mode === 'shared' ? continuityMode : undefined,
      },
      {
        onSuccess: () => {
          onClose();
        },
      }
    );
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      onClose();
    }
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('editAccountContext.title')}</DialogTitle>
          <DialogDescription>
            {t('editAccountContext.description', { name: account.name })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">{t('editAccountContext.syncMode')}</Label>
            </div>
            <div
              className="flex p-0.5 bg-muted/60 hover:bg-muted/80 transition-colors rounded-xl border border-border/40 w-full"
              role="radiogroup"
              aria-label={t('editAccountContext.syncMode')}
            >
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'isolated'}
                tabIndex={mode === 'isolated' ? 0 : -1}
                onClick={() => setMode('isolated')}
                onKeyDown={(event) =>
                  handleRadioKeyDown(event, mode, ['isolated', 'shared'] as const, setMode)
                }
                className={`flex-1 flex justify-center items-center gap-2 px-3 py-1.5 rounded-[10px] text-sm font-medium transition-all duration-200 overflow-hidden ${
                  mode === 'isolated'
                    ? 'bg-background text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-border/50'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <Unlink className="h-4 w-4 shrink-0" />
                <span className="truncate">{t('editAccountContext.isolatedOption')}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'shared'}
                tabIndex={mode === 'shared' ? 0 : -1}
                onClick={() => setMode('shared')}
                onKeyDown={(event) =>
                  handleRadioKeyDown(event, mode, ['isolated', 'shared'] as const, setMode)
                }
                className={`flex-1 flex justify-center items-center gap-2 px-3 py-1.5 rounded-[10px] text-sm font-medium transition-all duration-200 overflow-hidden ${
                  mode === 'shared'
                    ? 'bg-background text-emerald-600 dark:text-emerald-400 shadow-sm ring-1 ring-border/50'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <Link2 className="h-4 w-4 shrink-0" />
                <span className="truncate">{t('editAccountContext.sharedOption')}</span>
              </button>
            </div>
            <p className="text-xs text-muted-foreground pt-1 px-1">
              {mode === 'isolated'
                ? t('editAccountContext.isolatedModeHint')
                : t('editAccountContext.sharedModeHint')}
            </p>
          </div>

          {mode === 'shared' && (
            <div className="space-y-2">
              <Label htmlFor="context-group">{t('editAccountContext.historySyncGroup')}</Label>
              <Input
                id="context-group"
                value={group}
                onChange={(event) => setGroup(event.target.value)}
                placeholder={t('editAccountContext.groupPlaceholder')}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                {t('editAccountContext.groupHint', { max: MAX_CONTEXT_GROUP_LENGTH })}
              </p>
              {!isSharedGroupValid && (
                <p className="text-xs text-destructive">{t('editAccountContext.invalidGroup')}</p>
              )}
            </div>
          )}

          {mode === 'shared' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  {t('editAccountContext.continuityDepth')}
                </Label>
              </div>
              <div
                className="flex p-0.5 bg-muted/60 hover:bg-muted/80 transition-colors rounded-xl border border-border/40 w-full"
                role="radiogroup"
                aria-label={t('editAccountContext.continuityDepth')}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={continuityMode === 'standard'}
                  tabIndex={continuityMode === 'standard' ? 0 : -1}
                  onClick={() => setContinuityMode('standard')}
                  onKeyDown={(event) =>
                    handleRadioKeyDown(
                      event,
                      continuityMode,
                      ['standard', 'deeper'] as const,
                      setContinuityMode
                    )
                  }
                  className={`flex-1 flex justify-center items-center gap-2 px-3 py-1.5 rounded-[10px] text-sm font-medium transition-all duration-200 overflow-hidden ${
                    continuityMode === 'standard'
                      ? 'bg-background text-emerald-600 dark:text-emerald-400 shadow-sm ring-1 ring-border/50'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <Link2 className="h-4 w-4 shrink-0" />
                  <span className="truncate">{t('editAccountContext.standardOption')}</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={continuityMode === 'deeper'}
                  tabIndex={continuityMode === 'deeper' ? 0 : -1}
                  onClick={() => setContinuityMode('deeper')}
                  onKeyDown={(event) =>
                    handleRadioKeyDown(
                      event,
                      continuityMode,
                      ['standard', 'deeper'] as const,
                      setContinuityMode
                    )
                  }
                  className={`flex-1 flex justify-center items-center gap-2 px-3 py-1.5 rounded-[10px] text-sm font-medium transition-all duration-200 overflow-hidden ${
                    continuityMode === 'deeper'
                      ? 'bg-background text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-border/50'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <Waves className="h-4 w-4 shrink-0" />
                  <span className="truncate">{t('editAccountContext.deeperOption')}</span>
                </button>
              </div>
              <p className="text-xs text-muted-foreground pt-1 px-1">
                {continuityMode === 'standard'
                  ? t('editAccountContext.standardHint')
                  : t('editAccountContext.deeperHint')}
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {t('editAccountContext.credentialsIsolated')}
          </p>

          {showPlainLaneMismatch && (
            <div className="rounded-[14px] border border-amber-200 bg-amber-50/50 p-4 text-xs shadow-sm dark:border-amber-900/40 dark:bg-amber-900/10">
              <div className="space-y-2">
                <p className="font-medium text-foreground">
                  {t('continuityOverview.plainLaneTitle')}
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  {t('continuityOverview.plainLaneDescription', {
                    lane: laneLabel || 'plain ccs',
                    name: account.name,
                  })}
                </p>
                <div className="space-y-2">
                  <div className="rounded-md border bg-background px-2 py-2 font-mono text-[11px] flex items-start gap-2">
                    <span className="flex-1 break-all">ccs -r</span>
                    <CopyButton value="ccs -r" size="icon" />
                  </div>
                  <div className="rounded-md border bg-background px-2 py-2 font-mono text-[11px] flex items-start gap-2">
                    <span className="flex-1 break-all">ccs auth backup default</span>
                    <CopyButton value="ccs auth backup default" size="icon" />
                  </div>
                  <div className="rounded-md border bg-background px-2 py-2 font-mono text-[11px] flex items-start gap-2">
                    <span className="flex-1 break-all">{accountBackupCommand}</span>
                    <CopyButton value={accountBackupCommand} size="icon" />
                  </div>
                  <div className="rounded-md border bg-background px-2 py-2 font-mono text-[11px] flex items-start gap-2">
                    <span className="flex-1 break-all">{defaultCommand}</span>
                    <CopyButton value={defaultCommand} size="icon" />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div
            className={`rounded-[14px] border p-4 text-xs shadow-sm transition-colors ${mode === 'isolated' ? 'bg-blue-50/50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800/40' : 'bg-muted/40 border-border/60'}`}
          >
            <div className="flex items-start gap-3">
              {mode === 'isolated' ? (
                <ShieldAlert className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
              ) : (
                <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              )}
              <div className="space-y-1.5 flex-1 text-muted-foreground leading-relaxed">
                {mode === 'isolated' ? (
                  <p className="text-foreground font-medium selection:bg-blue-200">
                    {t('editAccountContext.isolatedImplication')}
                  </p>
                ) : (
                  <>
                    <p>
                      <span className="text-foreground font-medium">
                        {t('editAccountContext.sameGroupRule', { group: normalizedGroup })}
                      </span>{' '}
                      {sameGroupPeerCount > 0
                        ? t('editAccountContext.sameGroupPeerCount', { count: sameGroupPeerCount })
                        : t('editAccountContext.noSameGroupPeer')}
                    </p>
                    {continuityMode === 'deeper' && (
                      <p>
                        {sameGroupDeeperPeerCount > 0 ? (
                          t('editAccountContext.deeperReady', {
                            count: sameGroupDeeperPeerCount,
                          })
                        ) : (
                          <span className="text-amber-600 dark:text-amber-500">
                            {t('editAccountContext.deeperNeedsPeers')}
                          </span>
                        )}
                      </p>
                    )}
                  </>
                )}
                <p
                  className={`pt-1.5 text-[11px] ${mode === 'isolated' ? 'text-blue-700/70 dark:text-blue-300/60' : 'text-muted-foreground/70'}`}
                >
                  {t('editAccountContext.resumeOriginalWarning')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={updateContextMutation.isPending}>
            {t('editAccountContext.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!canSubmit || updateContextMutation.isPending}>
            {updateContextMutation.isPending
              ? t('editAccountContext.saving')
              : t('editAccountContext.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
