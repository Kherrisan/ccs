/**
 * Accounts Table Component
 * Dashboard parity: Full CRUD for auth profiles
 */

import { useState } from 'react';
import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Check, CheckCheck, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EditAccountContextDialog } from '@/components/account/edit-account-context-dialog';
import {
  useSetDefaultAccount,
  useDeleteAccount,
  useResetDefaultAccount,
  useUpdateAccountContext,
} from '@/hooks/use-accounts';
import type { AuthAccountRow, SharedGroupSummary } from '@/lib/account-continuity';
import type { PlainCcsLane } from '@/lib/api-client';

interface AccountsTableProps {
  data: AuthAccountRow[];
  defaultAccount: string | null;
  groupSummaries: SharedGroupSummary[];
  plainCcsLane: PlainCcsLane | null;
}

export function AccountsTable({
  data,
  defaultAccount,
  groupSummaries,
  plainCcsLane,
}: AccountsTableProps) {
  const { t } = useTranslation();
  const setDefaultMutation = useSetDefaultAccount();
  const deleteMutation = useDeleteAccount();
  const resetDefaultMutation = useResetDefaultAccount();
  const updateContextMutation = useUpdateAccountContext();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [contextTarget, setContextTarget] = useState<AuthAccountRow | null>(null);

  const columns: ColumnDef<AuthAccountRow>[] = [
    {
      accessorKey: 'name',
      header: t('accountsTable.name'),
      size: 200,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.original.name}</span>
          {row.original.name === defaultAccount && (
            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">
              {t('accountsTable.defaultBadge')}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: t('accountsTable.type'),
      size: 100,
      cell: ({ row }) => (
        <span className="capitalize text-muted-foreground">{row.original.type || 'oauth'}</span>
      ),
    },
    {
      accessorKey: 'created',
      header: t('accountsTable.created'),
      size: 150,
      cell: ({ row }) => {
        const date = new Date(row.original.created);
        return <span className="text-muted-foreground">{date.toLocaleDateString()}</span>;
      },
    },
    {
      accessorKey: 'last_used',
      header: t('accountsTable.lastUsed'),
      size: 150,
      cell: ({ row }) => {
        if (!row.original.last_used) return <span className="text-muted-foreground/50">-</span>;
        const date = new Date(row.original.last_used);
        return <span className="text-muted-foreground">{date.toLocaleDateString()}</span>;
      },
    },
    {
      id: 'context',
      header: t('accountsTable.historySync'),
      size: 170,
      cell: ({ row }) => {
        if (row.original.type === 'cliproxy') {
          return <span className="text-muted-foreground/50">-</span>;
        }

        const mode = row.original.context_mode || 'isolated';
        if (mode === 'shared') {
          const group = row.original.context_group || 'default';
          const isDeeper = row.original.continuity_mode === 'deeper';
          return (
            <div className="flex flex-col items-start gap-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge
                  variant="outline"
                  className={`font-mono text-[10px] uppercase px-1.5 py-0 border ${isDeeper ? 'text-indigo-700 border-indigo-300/60 bg-indigo-50/50 dark:text-indigo-300 dark:border-indigo-900/40 dark:bg-indigo-900/20' : 'text-emerald-700 border-emerald-300/60 bg-emerald-50/50 dark:text-emerald-300 dark:border-emerald-900/40 dark:bg-emerald-900/20'}`}
                >
                  {isDeeper ? t('accountsTable.badges.deeper') : t('accountsTable.badges.shared')}
                </Badge>
                <span className="text-xs font-semibold text-foreground/80">{group}</span>
              </div>
              <p className="text-[10px] text-muted-foreground whitespace-nowrap">
                {row.original.sameGroupPeerCount > 0
                  ? t('accountsTable.sameGroupPeerCount', {
                      count: row.original.sameGroupPeerCount,
                    })
                  : t('accountsTable.noSameGroupPeer')}
              </p>
            </div>
          );
        }

        if (row.original.context_inferred) {
          return (
            <div className="flex flex-col items-start gap-1">
              <Badge
                variant="outline"
                className="text-amber-700 border-amber-300/60 bg-amber-50/50 dark:text-amber-400 dark:border-amber-900/40 dark:bg-amber-900/20 font-mono text-[10px] uppercase px-1.5 py-0"
              >
                {t('accountsTable.badges.legacy')}
              </Badge>
              <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80 whitespace-nowrap">
                {t('accountsTable.legacyReview')}
              </p>
            </div>
          );
        }

        return (
          <div className="flex flex-col items-start gap-1.5">
            <Badge
              variant="secondary"
              className="font-mono text-[10px] uppercase px-1.5 py-0 text-muted-foreground bg-muted/60 border-transparent shadow-none"
            >
              {t('accountsTable.badges.isolated')}
            </Badge>
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: t('accountsTable.actions'),
      size: 220,
      cell: ({ row }) => {
        const isDefault = row.original.name === defaultAccount;
        const isPending =
          setDefaultMutation.isPending ||
          deleteMutation.isPending ||
          updateContextMutation.isPending;
        const isCliproxy = row.original.type === 'cliproxy';
        const hasLegacyInference =
          row.original.context_inferred || row.original.continuity_inferred;

        return (
          <div className="flex items-center gap-1">
            {!isCliproxy && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                disabled={isPending}
                onClick={() => setContextTarget(row.original)}
                title={t('accountsTable.syncTitle')}
              >
                <Pencil className="w-3.5 h-3.5 mr-1" />
                {t('accountsTable.sync')}
              </Button>
            )}
            {!isCliproxy && hasLegacyInference && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-amber-700 hover:text-amber-700 hover:bg-amber-500/10 dark:text-amber-400 dark:hover:text-amber-400"
                disabled={isPending}
                onClick={() =>
                  updateContextMutation.mutate({
                    name: row.original.name,
                    context_mode: row.original.context_mode === 'shared' ? 'shared' : 'isolated',
                    context_group:
                      row.original.context_mode === 'shared'
                        ? row.original.context_group || 'default'
                        : undefined,
                    continuity_mode:
                      row.original.context_mode === 'shared'
                        ? row.original.continuity_mode === 'deeper'
                          ? 'deeper'
                          : 'standard'
                        : undefined,
                  })
                }
                title={t('accountsTable.confirmLegacyTitle')}
              >
                <CheckCheck className="w-3 h-3 mr-1" />
                {t('accountsTable.confirm')}
              </Button>
            )}
            <Button
              variant={isDefault ? 'secondary' : 'default'}
              size="sm"
              className="h-8 px-2"
              disabled={isDefault || isPending}
              onClick={() => setDefaultMutation.mutate(row.original.name)}
            >
              <Check className={`w-3 h-3 mr-1 ${isDefault ? 'opacity-50' : ''}`} />
              {isDefault ? t('accountsTable.active') : t('accountsTable.setDefault')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              disabled={isDefault || isPending}
              onClick={() => setDeleteTarget(row.original.name)}
              title={
                isDefault
                  ? t('accountsTable.cannotDeleteDefault')
                  : t('accountsTable.deleteAccount')
              }
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">{t('accountsTable.noAccounts')}</div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const widthClass =
                      {
                        name: 'w-[200px]',
                        type: 'w-[100px]',
                        created: 'w-[150px]',
                        last_used: 'w-[150px]',
                        context: 'w-[170px]',
                        actions: 'w-[290px]',
                      }[header.id] || 'w-auto';

                    return (
                      <TableHead key={header.id} className={widthClass}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Reset default button */}
        {defaultAccount && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetDefaultMutation.mutate()}
              disabled={resetDefaultMutation.isPending}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              {t('accountsTable.resetToDefault')}
            </Button>
          </div>
        )}
      </div>

      {contextTarget && (
        <EditAccountContextDialog
          account={contextTarget}
          groupSummaries={groupSummaries}
          plainCcsLane={plainCcsLane}
          onClose={() => setContextTarget(null)}
        />
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('accountsTable.deleteDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('accountsTable.deleteDialogDesc', { name: deleteTarget ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('accountsTable.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget);
                  setDeleteTarget(null);
                }
              }}
            >
              {t('accountsTable.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
