export type CodexEffort = 'medium' | 'high' | 'xhigh';

const CODEX_EFFORT_SUFFIX_REGEX = /-(medium|high|xhigh)$/i;
const CODEX_EFFORTS_IN_ORDER: readonly CodexEffort[] = ['medium', 'high', 'xhigh'];

function trimModelId(modelId: string | undefined): string {
  return modelId?.trim() ?? '';
}

export function parseCodexEffort(modelId: string | undefined): CodexEffort | undefined {
  if (!modelId) return undefined;
  const match = trimModelId(modelId).match(CODEX_EFFORT_SUFFIX_REGEX);
  if (!match?.[1]) return undefined;
  return match[1].toLowerCase() as CodexEffort;
}

export function stripCodexEffortSuffix(modelId: string | undefined): string {
  return trimModelId(modelId).replace(CODEX_EFFORT_SUFFIX_REGEX, '');
}

export function applyCodexEffortSuffix(
  modelId: string | undefined,
  effort: CodexEffort | undefined
): string {
  const normalizedModelId = stripCodexEffortSuffix(modelId);
  if (!normalizedModelId || !effort) {
    return normalizedModelId;
  }
  return `${normalizedModelId}-${effort}`;
}

export function getCodexEffortVariants(
  modelId: string,
  maxEffort: CodexEffort | undefined
): string[] {
  if (!maxEffort) {
    const explicitEffort = parseCodexEffort(modelId);
    return [applyCodexEffortSuffix(modelId, explicitEffort)];
  }

  const normalizedModelId = stripCodexEffortSuffix(modelId);
  const variantIds = [normalizedModelId];

  for (const effort of CODEX_EFFORTS_IN_ORDER) {
    variantIds.push(applyCodexEffortSuffix(normalizedModelId, effort));
    if (effort === maxEffort) {
      break;
    }
  }

  return variantIds;
}

export function getCodexEffortDisplay(
  modelId: string | undefined,
  effortLabels?: { pinned: (effort: string) => string; auto: string }
): { label: string; explicit: boolean } | null {
  if (!modelId) return null;
  const effort = parseCodexEffort(modelId);
  if (effort) {
    return {
      label: effortLabels?.pinned(effort) ?? `Pinned ${effort}`,
      explicit: true,
    };
  }
  return { label: effortLabels?.auto ?? 'Auto effort', explicit: false };
}
