/**
 * OpenRouter Model Picker Component
 * Searchable model selector with categories and pricing
 */

import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, RefreshCw, Loader2, Sparkles } from 'lucide-react';
import { useOpenRouterCatalog, useRefreshOpenRouterModels } from '@/hooks/use-openrouter-models';
import {
  searchModels,
  sortModelsByPriority,
  formatPricingPair,
  formatContextLength,
  formatModelAge,
  getNewestModelsPerProvider,
  CATEGORY_LABELS,
} from '@/lib/openrouter-utils';
import type { CategorizedModel, ModelCategory } from '@/lib/openrouter-types';
import { cn } from '@/lib/utils';

interface OpenRouterModelPickerProps {
  value?: string;
  onChange: (modelId: string) => void;
  placeholder?: string;
  className?: string;
}

export function OpenRouterModelPicker({
  value,
  onChange,
  placeholder,
  className,
}: OpenRouterModelPickerProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ModelCategory | null>(null);

  const { models, isLoading, isError, isFetching } = useOpenRouterCatalog();
  const refreshModels = useRefreshOpenRouterModels();

  // Filter and group models
  const filteredModels = useMemo(() => {
    return searchModels(models, search, {
      category: selectedCategory ?? undefined,
    });
  }, [models, search, selectedCategory]);

  // Get newest models for presets (shown when no search)
  const newestModels = useMemo(() => {
    return getNewestModelsPerProvider(models, 2);
  }, [models]);

  // Determine if we should show presets (no search query and no category filter)
  const showPresets = !search.trim() && !selectedCategory;

  // Group by category and sort each group by priority (Free > Exacto > Regular)
  const groupedModels = useMemo(() => {
    const groups: Record<ModelCategory, CategorizedModel[]> = {
      anthropic: [],
      openai: [],
      google: [],
      meta: [],
      mistral: [],
      opensource: [],
      other: [],
    };

    filteredModels.forEach((model) => {
      groups[model.category].push(model);
    });

    // Sort each category by priority
    for (const category of Object.keys(groups) as ModelCategory[]) {
      groups[category] = sortModelsByPriority(groups[category]);
    }

    return groups;
  }, [filteredModels]);

  const handleRefresh = useCallback(() => {
    refreshModels();
  }, [refreshModels]);

  const selectedModel = models.find((m) => m.id === value);

  if (isLoading && models.length === 0) {
    return (
      <div className={cn('space-y-2', className)}>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-2 w-full min-w-0 overflow-hidden', className)}>
      {/* Search Header */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={placeholder ?? t('openrouterModelPicker.searchModels')}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={handleRefresh}
          disabled={isFetching}
          title="Refresh models"
        >
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-1">
        <Badge
          variant={selectedCategory === null ? 'default' : 'outline'}
          className="cursor-pointer"
          onClick={() => setSelectedCategory(null)}
        >
          All ({models.length})
        </Badge>
        {(Object.keys(CATEGORY_LABELS) as ModelCategory[]).map((cat) => {
          const count = groupedModels[cat].length;
          if (count === 0) return null;
          return (
            <Badge
              key={cat}
              variant={selectedCategory === cat ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSelectedCategory(cat)}
            >
              {CATEGORY_LABELS[cat]} ({count})
            </Badge>
          );
        })}
      </div>

      {/* Selected Model Display */}
      {selectedModel && (
        <div className="bg-muted rounded-md p-2 text-sm">
          <span className="font-medium">{selectedModel.name}</span>
          <span className="text-muted-foreground ml-2">
            {formatPricingPair(selectedModel.pricing)} |{' '}
            {formatContextLength(selectedModel.context_length)}
          </span>
        </div>
      )}

      {/* Model List */}
      <ScrollArea className="h-72 w-full rounded-md border">
        {isError ? (
          <div className="text-destructive p-4 text-center">
            Failed to load models.{' '}
            <Button variant="link" onClick={handleRefresh}>
              Retry
            </Button>
          </div>
        ) : filteredModels.length === 0 ? (
          <div className="text-muted-foreground p-4 text-center">
            No models found matching &quot;{search}&quot;
          </div>
        ) : (
          <div className="space-y-6 p-3">
            {/* Newest Models Section (shown when no search) */}
            {showPresets && newestModels.length > 0 && (
              <div>
                <div className="text-muted-foreground bg-background sticky top-0 mb-2 flex items-center gap-1.5 py-1.5 text-xs font-semibold border-b pb-2">
                  <Sparkles className="h-3 w-3 text-accent" />
                  <span>{t('openrouterModelPicker.newestModels')}</span>
                </div>
                <div className="space-y-1">
                  {newestModels.map((model) => (
                    <ModelItem
                      key={model.id}
                      model={model}
                      isSelected={model.id === value}
                      onClick={() => onChange(model.id)}
                      showAge
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Category Groups */}
            {(Object.keys(CATEGORY_LABELS) as ModelCategory[]).map((category) => {
              const categoryModels = groupedModels[category];
              if (categoryModels.length === 0) return null;

              return (
                <div key={category}>
                  <div className="text-muted-foreground bg-background sticky top-0 mb-2 py-1.5 text-xs font-semibold border-b pb-2">
                    {CATEGORY_LABELS[category]}
                  </div>
                  <div className="space-y-1">
                    {categoryModels.map((model) => (
                      <ModelItem
                        key={model.id}
                        model={model}
                        isSelected={model.id === value}
                        onClick={() => onChange(model.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function ModelItem({
  model,
  isSelected,
  onClick,
  showAge = false,
}: {
  model: CategorizedModel;
  isSelected: boolean;
  onClick: () => void;
  showAge?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        isSelected && 'bg-accent text-accent-foreground'
      )}
    >
      <span className="flex-1 min-w-0 truncate font-medium">{model.name}</span>
      <span
        className={cn(
          'flex shrink-0 items-center gap-1 text-xs whitespace-nowrap',
          isSelected
            ? 'text-accent-foreground/80'
            : 'text-muted-foreground group-hover:text-accent-foreground/80'
        )}
      >
        {showAge && model.created && (
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] px-1',
              isSelected
                ? 'border-accent-foreground/30 text-accent-foreground/80'
                : 'text-accent border-accent/30 group-hover:text-accent-foreground/80 group-hover:border-accent-foreground/30'
            )}
          >
            {formatModelAge(model.created)}
          </Badge>
        )}
        {model.isFree ? (
          <Badge
            variant="secondary"
            className={cn(
              'text-[10px] px-1',
              isSelected
                ? 'bg-accent-foreground/20 text-accent-foreground'
                : 'group-hover:bg-accent-foreground/20 group-hover:text-accent-foreground'
            )}
          >
            Free
          </Badge>
        ) : model.isExacto ? (
          <>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] px-1 border-emerald-500/50 text-emerald-600',
                isSelected
                  ? 'border-accent-foreground/30 text-accent-foreground/80'
                  : 'group-hover:border-accent-foreground/30 group-hover:text-accent-foreground/80'
              )}
            >
              Exacto
            </Badge>
            <span className="tabular-nums">{formatPricingPair(model.pricing)}</span>
          </>
        ) : (
          <span className="tabular-nums">{formatPricingPair(model.pricing)}</span>
        )}
        <span className="tabular-nums">{formatContextLength(model.context_length)}</span>
      </span>
    </button>
  );
}
