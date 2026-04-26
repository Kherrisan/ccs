/**
 * Analytics Page Hooks
 *
 * Composite hook centralizing all data fetching and state for the analytics page.
 */

import { useState, useMemo, useCallback } from 'react';
import type { DateRange } from 'react-day-picker';
import { subDays, formatDistanceToNow } from 'date-fns';
import {
  useUsageSummary,
  useUsageTrends,
  useHourlyUsage,
  useModelUsage,
  useRefreshUsage,
  useUsageStatus,
  useSessions,
  type ModelUsage,
} from '@/hooks/use-usage';

const RECENT_SESSION_SAMPLE_LIMIT = 50;

export function useAnalyticsPage() {
  // Default to last 30 days
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelUsage | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [viewMode, setViewMode] = useState<'daily' | 'hourly'>('daily');

  // Refresh hook
  const refreshUsage = useRefreshUsage();

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshUsage();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshUsage]);

  // Convert dates to API format - memoized to prevent unnecessary re-renders
  const apiOptions = useMemo(
    () => ({
      startDate: dateRange?.from,
      endDate: dateRange?.to,
    }),
    [dateRange?.from, dateRange?.to]
  );

  // Fetch data
  const { data: summary, isLoading: isSummaryLoading } = useUsageSummary(apiOptions);
  const { data: trends, isLoading: isTrendsLoading } = useUsageTrends(apiOptions);
  const { data: hourlyData, isLoading: isHourlyLoading } = useHourlyUsage(apiOptions);
  const { data: models, isLoading: isModelsLoading } = useModelUsage(apiOptions);
  const { data: sessions, isLoading: isSessionsLoading } = useSessions({
    ...apiOptions,
    limit: RECENT_SESSION_SAMPLE_LIMIT,
  });
  const { data: status } = useUsageStatus();

  // Handle "24H" preset click
  const handleTodayClick = useCallback(() => {
    const now = new Date();
    setDateRange({ from: subDays(now, 1), to: now });
    setViewMode('hourly');
  }, []);

  // Handle date range changes from DateRangeFilter
  const handleDateRangeChange = useCallback((range: DateRange | undefined) => {
    setDateRange(range);
    setViewMode('daily'); // Switch back to daily view for multi-day ranges
  }, []);

  // Format "Last updated" text
  const lastUpdatedText = useMemo(() => {
    if (!status?.lastFetch) return null;
    return formatDistanceToNow(new Date(status.lastFetch), { addSuffix: true });
  }, [status?.lastFetch]);

  // Handle model click for popover
  const handleModelClick = useCallback((model: ModelUsage, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setPopoverPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    setSelectedModel(model);
  }, []);

  const handlePopoverClose = useCallback(() => {
    setSelectedModel(null);
    setPopoverPosition(null);
  }, []);

  return {
    // State
    dateRange,
    isRefreshing,
    viewMode,
    selectedModel,
    popoverPosition,
    // Data
    summary,
    trends,
    hourlyData,
    models,
    sessions,
    status,
    // Loading states
    isSummaryLoading,
    isTrendsLoading,
    isHourlyLoading,
    isModelsLoading,
    isSessionsLoading,
    // Combined loading
    isLoading: isSummaryLoading || isTrendsLoading || isModelsLoading || isSessionsLoading,
    // Handlers
    handleRefresh,
    handleTodayClick,
    handleDateRangeChange,
    handleModelClick,
    handlePopoverClose,
    // Text
    lastUpdatedText,
  };
}
