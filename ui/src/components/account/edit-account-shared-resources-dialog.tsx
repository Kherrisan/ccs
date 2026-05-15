import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUpdateAccountSharedResources } from '@/hooks/use-accounts';
import type { AuthAccountRow } from '@/lib/account-continuity';
import { AlertCircle, Box, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface EditAccountSharedResourcesDialogProps {
  account: AuthAccountRow;
  onClose: () => void;
}

export function EditAccountSharedResourcesDialog({
  account,
  onClose,
}: EditAccountSharedResourcesDialogProps) {
  const { t } = useTranslation();
  const updateMutation = useUpdateAccountSharedResources();

  const [resourceMode, setResourceMode] = useState<'shared' | 'profile-local'>(
    account.shared_resource_mode || 'shared'
  );

  const handleSave = () => {
    updateMutation.mutate(
      {
        name: account.name,
        shared_resource_mode: resourceMode,
      },
      {
        onSuccess: () => {
          onClose();
        },
      }
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('editAccountSharedResources.title')}</DialogTitle>
          <DialogDescription>
            {t('editAccountSharedResources.description', { name: account.name })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="resource-mode">{t('editAccountSharedResources.resourceMode')}</Label>
            <Select
              value={resourceMode}
              onValueChange={(val) => setResourceMode(val as 'shared' | 'profile-local')}
            >
              <SelectTrigger id="resource-mode" className="w-full">
                <SelectValue placeholder={t('editAccountSharedResources.selectResourceMode')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shared">
                  <div className="flex flex-col items-start py-1">
                    <span className="font-medium text-sm">
                      {t('editAccountSharedResources.sharedOption')}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {t('editAccountSharedResources.sharedHint')}
                    </span>
                  </div>
                </SelectItem>
                <SelectItem value="profile-local">
                  <div className="flex flex-col items-start py-1">
                    <span className="font-medium text-sm">
                      {t('editAccountSharedResources.profileLocalOption')}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {t('editAccountSharedResources.profileLocalHint')}
                    </span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('editAccountSharedResources.implicationTitle')}
            </p>

            {resourceMode === 'shared' ? (
              <Alert className="border-emerald-500/20 bg-emerald-500/5">
                <Box className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <AlertTitle className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  {t('editAccountSharedResources.sharedOption')}
                </AlertTitle>
                <AlertDescription className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                  {t('editAccountSharedResources.sharedImplication')}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-amber-500/20 bg-amber-500/5">
                <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <AlertTitle className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                  {t('editAccountSharedResources.profileLocalOption')}
                </AlertTitle>
                <AlertDescription className="text-xs text-amber-700/80 dark:text-amber-400/80">
                  {t('editAccountSharedResources.profileLocalImplication')}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {account.shared_resource_inferred && (
            <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3">
              <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-[11px] text-muted-foreground">{t('accountsTable.legacyReview')}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('editAccountSharedResources.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending
              ? t('editAccountSharedResources.saving')
              : t('editAccountSharedResources.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
