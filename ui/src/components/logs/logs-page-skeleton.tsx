import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from 'react-i18next';

export function LogsPageSkeleton() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6" aria-label={t('logsPageSkeleton.loadingLogs')}>
      <Card className="gap-4">
        <CardHeader className="space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-[30rem]" />
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <Card key={item} className="gap-3">
            <CardHeader className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-7 w-24" />
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_22rem]">
        <Card className="gap-4">
          <CardHeader className="space-y-3">
            <Skeleton className="h-4 w-52" />
            <div className="grid gap-3 md:grid-cols-4">
              {[1, 2, 3, 4].map((item) => (
                <Skeleton key={item} className="h-10 w-full" />
              ))}
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
            <Skeleton className="h-[26rem] w-full" />
            <Skeleton className="h-[26rem] w-full" />
          </CardContent>
        </Card>

        <Card className="gap-4">
          <CardHeader className="space-y-3">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-full" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3, 4].map((item) => (
              <Skeleton key={item} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
