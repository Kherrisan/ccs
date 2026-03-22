/**
 * OpenRouter Quick Start Card
 * Prominent CTA for new users to create OpenRouter profile
 */

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useOpenRouterReady } from '@/hooks/use-openrouter-models';
import {
  Sparkles,
  ExternalLink,
  ArrowRight,
  Zap,
  CloudCog,
  KeyRound,
  SlidersHorizontal,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface OpenRouterQuickStartProps {
  onOpenRouterClick: () => void;
  onAlibabaCodingPlanClick: () => void;
  onCliproxyClick: () => void;
  onCustomClick: () => void;
}

export function OpenRouterQuickStart({
  onOpenRouterClick,
  onAlibabaCodingPlanClick,
  onCliproxyClick,
  onCustomClick,
}: OpenRouterQuickStartProps) {
  const { t } = useTranslation();
  const { modelCount, isLoading } = useOpenRouterReady();

  return (
    <div className="flex-1 flex items-center justify-center bg-muted/20 p-8">
      <div className="max-w-lg w-full space-y-6">
        {/* Main OpenRouter Card */}
        <Card className="border-accent/30 dark:border-accent/40 bg-gradient-to-br from-accent/5 to-background dark:from-accent/10">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-accent/10 dark:bg-accent/20">
                <img src="/icons/openrouter.svg" alt="OpenRouter" className="w-6 h-6" />
              </div>
              <Badge
                variant="secondary"
                className="bg-accent/10 text-accent dark:bg-accent/20 dark:text-accent-foreground"
              >
                {t('openrouterQuickStart.recommended')}
              </Badge>
            </div>
            <CardTitle className="text-xl">{t('openrouterQuickStart.title')}</CardTitle>
            <CardDescription className="text-base">
              {t('openrouterQuickStart.description', {
                modelCountLabel: isLoading ? '300+' : `${modelCount}+`,
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Key Features */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Zap className="w-4 h-4 text-accent" />
                <span>{t('openrouterQuickStart.featureOneApi')}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Sparkles className="w-4 h-4 text-accent" />
                <span>{t('openrouterQuickStart.featureTierMapping')}</span>
              </div>
            </div>

            <Button
              onClick={onOpenRouterClick}
              className="w-full bg-accent hover:bg-accent/90 text-white"
              size="lg"
            >
              {t('openrouterQuickStart.createOpenRouterProfile')}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              {t('openrouterQuickStart.getApiKeyAt')}{' '}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline inline-flex items-center gap-1"
              >
                openrouter.ai/keys
                <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </CardContent>
        </Card>

        {/* Alibaba Coding Plan Card */}
        <Card className="border-orange-500/30 dark:border-orange-500/40 bg-gradient-to-br from-orange-500/5 to-background dark:from-orange-500/10">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-orange-500/10 dark:bg-orange-500/20">
                <img
                  src="/assets/providers/alibabacloud-color.svg"
                  alt="Alibaba Coding Plan"
                  className="w-6 h-6"
                />
              </div>
              <Badge
                variant="secondary"
                className="bg-orange-500/10 text-orange-700 dark:bg-orange-500/20 dark:text-orange-200"
              >
                {t('alibabaCodingPlanQuickStart.recommended')}
              </Badge>
            </div>
            <CardTitle className="text-xl">{t('alibabaCodingPlanQuickStart.title')}</CardTitle>
            <CardDescription className="text-base">
              {t('alibabaCodingPlanQuickStart.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CloudCog className="w-4 h-4 text-orange-600" />
                <span>{t('alibabaCodingPlanQuickStart.featureEndpoint')}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <KeyRound className="w-4 h-4 text-orange-600" />
                <span>{t('alibabaCodingPlanQuickStart.featureKeyFormat')}</span>
              </div>
            </div>

            <Button
              onClick={onAlibabaCodingPlanClick}
              className="w-full bg-orange-600 hover:bg-orange-600/90 text-white"
              size="lg"
            >
              {t('alibabaCodingPlanQuickStart.createAlibabaProfile')}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              {t('alibabaCodingPlanQuickStart.readGuideAt')}{' '}
              <a
                href="https://www.alibabacloud.com/help/en/model-studio/coding-plan"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-700 dark:text-orange-400 hover:underline inline-flex items-center gap-1"
              >
                Alibaba Cloud Model Studio
                <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/30 dark:border-emerald-500/40 bg-gradient-to-br from-emerald-500/5 to-background dark:from-emerald-500/10">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20">
                <SlidersHorizontal className="w-6 h-6 text-emerald-700 dark:text-emerald-300" />
              </div>
              <Badge
                variant="secondary"
                className="bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
              >
                Configure in AI Providers
              </Badge>
            </div>
            <CardTitle className="text-xl">Manage CLIProxy AI providers</CardTitle>
            <CardDescription className="text-base">
              Configure Gemini, Codex, Claude, Vertex, and OpenAI-compatible connectors directly in
              the dedicated CLIProxy AI Providers page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <SlidersHorizontal className="w-4 h-4 text-emerald-600" />
                <span>Dedicated /cliproxy/ai-providers workspace</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <KeyRound className="w-4 h-4 text-emerald-600" />
                <span>Manage provider secrets outside API Profiles</span>
              </div>
            </div>

            <Button
              onClick={onCliproxyClick}
              className="w-full bg-emerald-600 hover:bg-emerald-600/90 text-white"
              size="lg"
            >
              Open AI Providers
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Keep runtime provider configuration in CLIProxy, then create API Profiles only when
              you need standalone Anthropic-compatible endpoints.
            </p>
          </CardContent>
        </Card>

        {/* Divider */}
        <div className="flex items-center gap-4">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">{t('openrouterQuickStart.or')}</span>
          <Separator className="flex-1" />
        </div>

        {/* Custom Option */}
        <Button variant="outline" onClick={onCustomClick} className="w-full">
          {t('openrouterQuickStart.createCustomProfile')}
        </Button>
      </div>
    </div>
  );
}
