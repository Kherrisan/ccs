/**
 * Image analysis environment preparation for settings-based profiles.
 *
 * Split from settings-flow.ts to keep that file under the 300 LOC budget.
 * Resolves runtime status, connection, and env overrides for image analysis MCP.
 */

import { warn, info } from '../../utils/ui';
import {
  applyImageAnalysisRuntimeOverrides,
  getImageAnalysisHookEnv,
  resolveImageAnalysisRuntimeConnection,
  resolveImageAnalysisRuntimeStatus,
} from '../../utils/hooks';
import { ensureCliproxyService } from '../../cliproxy';
import { CLIPROXY_DEFAULT_PORT } from '../../cliproxy/config/port-manager';
import type { ProfileDetectionResult } from '../../auth/profile-detector';
import type { loadSettings } from '../../config/config-loader-facade';
import type { resolveCliproxyBridgeMetadata } from '../../api/services/cliproxy-profile-bridge';
import type { resolveTargetType } from '../../targets/target-resolver';

export interface SettingsImageAnalysisPrepContext {
  profileInfo: ProfileDetectionResult;
  resolvedTarget: ReturnType<typeof resolveTargetType>;
  settings: ReturnType<typeof loadSettings>;
  cliproxyBridge: ReturnType<typeof resolveCliproxyBridgeMetadata> | undefined;
  imageAnalysisMcpReady: boolean;
  imageAnalysisFallbackHookReady: boolean | undefined;
  remainingArgs: string[];
  targetRemainingArgs: string[];
}

/**
 * Resolve the complete image analysis env vars for a settings-based profile launch.
 * Handles native-read fallback and proxy-stopped recovery.
 */
export async function resolveSettingsImageAnalysisEnv(
  ctx: SettingsImageAnalysisPrepContext
): Promise<NodeJS.ProcessEnv> {
  const {
    profileInfo,
    resolvedTarget,
    settings,
    cliproxyBridge,
    imageAnalysisMcpReady,
    imageAnalysisFallbackHookReady,
    remainingArgs,
    targetRemainingArgs,
  } = ctx;

  const imageAnalysisStatus = await resolveImageAnalysisRuntimeStatus({
    profileName: profileInfo.name,
    profileType: profileInfo.type,
    settings,
    cliproxyBridge,
    sharedHookInstalled: imageAnalysisFallbackHookReady,
  });
  const runtimeConnection = resolveImageAnalysisRuntimeConnection();
  let imageAnalysisEnv = getImageAnalysisHookEnv({
    profileName: profileInfo.name,
    profileType: profileInfo.type,
    settings,
    cliproxyBridge,
  });
  imageAnalysisEnv = applyImageAnalysisRuntimeOverrides(imageAnalysisEnv, {
    backendId: imageAnalysisStatus.backendId,
    model: imageAnalysisStatus.model,
    runtimePath: imageAnalysisStatus.runtimePath,
    baseUrl: runtimeConnection.baseUrl,
    apiKey: runtimeConnection.apiKey,
    allowSelfSigned: runtimeConnection.allowSelfSigned,
  });
  imageAnalysisEnv = {
    ...imageAnalysisEnv,
    CCS_IMAGE_ANALYSIS_SKIP_HOOK: resolvedTarget === 'claude' && imageAnalysisMcpReady ? '1' : '0',
  };

  const imageAnalysisProvider = imageAnalysisEnv['CCS_CURRENT_PROVIDER'];
  if (
    resolvedTarget === 'claude' &&
    imageAnalysisEnv['CCS_IMAGE_ANALYSIS_SKIP'] !== '1' &&
    imageAnalysisProvider
  ) {
    const verboseProxyLaunch =
      remainingArgs.includes('--verbose') ||
      remainingArgs.includes('-v') ||
      targetRemainingArgs.includes('--verbose') ||
      targetRemainingArgs.includes('-v');

    if (imageAnalysisStatus.effectiveRuntimeMode === 'native-read') {
      console.error(
        info(
          `${imageAnalysisStatus.effectiveRuntimeReason || `Image analysis via ${imageAnalysisProvider} is unavailable.`} This session will use native Read.`
        )
      );
      imageAnalysisEnv = {
        ...imageAnalysisEnv,
        CCS_CURRENT_PROVIDER: '',
        CCS_IMAGE_ANALYSIS_SKIP: '1',
        CCS_IMAGE_ANALYSIS_RUNTIME_PATH: '',
        CCS_IMAGE_ANALYSIS_RUNTIME_BASE_URL: '',
        CCS_IMAGE_ANALYSIS_RUNTIME_API_KEY: '',
        CCS_IMAGE_ANALYSIS_RUNTIME_ALLOW_SELF_SIGNED: '0',
      };
    } else if (imageAnalysisStatus.proxyReadiness === 'stopped') {
      const ensureServiceResult = await ensureCliproxyService(
        CLIPROXY_DEFAULT_PORT,
        verboseProxyLaunch
      );
      if (!ensureServiceResult.started) {
        console.error(
          warn(
            `Image analysis via ${imageAnalysisProvider} is unavailable because CCS could not start the local CLIProxy service. This session will use native Read.`
          )
        );
        imageAnalysisEnv = {
          ...imageAnalysisEnv,
          CCS_CURRENT_PROVIDER: '',
          CCS_IMAGE_ANALYSIS_SKIP: '1',
        };
      }
    }
  }

  return imageAnalysisEnv;
}
