/**
 * CLIProxy Control Panel Embed
 *
 * Embeds the CLIProxy management.html with auto-authentication.
 * Uses postMessage to inject credentials into the iframe.
 * Supports both local and remote CLIProxy server connections.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { RefreshCw, AlertCircle, Gauge } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, withApiBase } from '@/lib/api-client';
import type { CliproxyServerConfig } from '@/lib/api-client';
import { CLIPROXY_DEFAULT_PORT } from '@/lib/preset-utils';

interface AuthTokensResponse {
  apiKey: { value: string; isCustom: boolean };
  managementSecret: { value: string; isCustom: boolean };
}

interface ControlPanelEmbedProps {
  port?: number;
}

export function ControlPanelEmbed({ port = CLIPROXY_DEFAULT_PORT }: ControlPanelEmbedProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [iframeRevision, setIframeRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Fetch cliproxy_server config for remote/local mode detection
  const { data: cliproxyConfig, error: configError } = useQuery<CliproxyServerConfig>({
    queryKey: ['cliproxy-server-config'],
    queryFn: () => api.cliproxyServer.get(),
    staleTime: 30000, // 30 seconds
  });

  // Fetch auth tokens for local mode (gets effective management secret)
  const { data: authTokens } = useQuery<AuthTokensResponse>({
    queryKey: ['auth-tokens-raw'],
    queryFn: async () => {
      const response = await fetch(withApiBase('/settings/auth/tokens/raw'));
      if (!response.ok) throw new Error('Failed to fetch auth tokens');
      return response.json();
    },
    staleTime: 30000, // 30 seconds
  });

  // Log config fetch errors (fallback to local mode on error)
  useEffect(() => {
    if (configError) {
      console.warn('[ControlPanelEmbed] Config fetch failed, using local mode:', configError);
    }
  }, [configError]);

  // Calculate URLs and settings based on remote or local mode
  const { managementUrl, checkUrl, authToken, isRemote, displayHost } = useMemo(() => {
    const remote = cliproxyConfig?.remote;

    if (remote?.enabled && remote?.host) {
      const protocol = remote.protocol || 'http';
      // Use port from config, or default based on protocol (443 for https, 8317 for http)
      const remotePort = remote.port || (protocol === 'https' ? 443 : CLIPROXY_DEFAULT_PORT);
      // Only include port in URL if it's non-standard
      const portSuffix =
        (protocol === 'https' && remotePort === 443) || (protocol === 'http' && remotePort === 80)
          ? ''
          : `:${remotePort}`;
      const baseUrl = `${protocol}://${remote.host}${portSuffix}`;

      return {
        managementUrl: `${baseUrl}/management.html`,
        checkUrl: `${baseUrl}/`,
        authToken: remote.auth_token || undefined,
        isRemote: true,
        displayHost: `${remote.host}${portSuffix}`,
      };
    }

    // Local mode - use effective management secret from auth tokens API
    const effectiveSecret = authTokens?.managementSecret?.value || 'ccs';
    return {
      managementUrl: `http://localhost:${port}/management.html`,
      checkUrl: `http://localhost:${port}/`,
      authToken: effectiveSecret,
      isRemote: false,
      displayHost: `localhost:${port}`,
    };
  }, [cliproxyConfig, authTokens, port]);

  const iframeLoaded = loadedUrl === managementUrl;
  const isLoading = !iframeLoaded;

  // Check if CLIProxy is running
  useEffect(() => {
    const controller = new AbortController();

    const checkConnection = async () => {
      try {
        const response = await fetch(checkUrl, {
          signal: controller.signal,
        });
        if (response.ok) {
          setIsConnected(true);
          setError(null);
        } else {
          setIsConnected(false);
          setError(
            isRemote
              ? `Remote CLIProxy at ${displayHost} returned an error`
              : 'CLIProxy returned an error'
          );
        }
      } catch (e) {
        // Ignore abort errors (component unmounting)
        if (e instanceof Error && e.name === 'AbortError') return;

        setIsConnected(false);
        setError(
          isRemote
            ? `Remote CLIProxy at ${displayHost} is not reachable`
            : 'CLIProxy is not running'
        );
      }
    };

    // Start connection check with timeout
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    checkConnection().finally(() => clearTimeout(timeoutId));

    // Cleanup: abort fetch on unmount
    return () => controller.abort();
  }, [checkUrl, isRemote, displayHost]);

  const postAutoLoginCredentials = useCallback(() => {
    // Auto-login can only run when iframe has loaded and authToken is available.
    if (!iframeLoaded || !iframeRef.current?.contentWindow || !authToken) {
      return;
    }

    try {
      // Derive apiBase from checkUrl (remove trailing slash)
      const apiBase = checkUrl.replace(/\/$/, '');

      // Security: Validate iframe src matches target origin before sending credentials
      const iframeSrc = iframeRef.current.src;
      if (!iframeSrc.startsWith(apiBase)) {
        console.warn('[ControlPanelEmbed] Iframe origin mismatch, skipping postMessage');
        return;
      }

      // Send credentials to iframe
      iframeRef.current.contentWindow.postMessage(
        {
          type: 'ccs-auto-login',
          apiBase,
          managementKey: authToken,
        },
        apiBase
      );
    } catch (e) {
      // Cross-origin restriction - expected if not same origin
      console.debug('[ControlPanelEmbed] postMessage failed - cross-origin:', e);
    }
  }, [authToken, checkUrl, iframeLoaded]);

  // Retry auto-login when token/checkUrl arrive after iframe onLoad.
  useEffect(() => {
    postAutoLoginCredentials();
  }, [postAutoLoginCredentials]);

  // Handle iframe load - mark ready then let effect post credentials.
  const handleIframeLoad = useCallback(() => {
    setLoadedUrl(managementUrl);
  }, [managementUrl]);

  const handleRefresh = () => {
    setLoadedUrl(null);
    setIframeRevision((value) => value + 1);
    setError(null);
    setIsConnected(false);
  };

  // Show error state if CLIProxy is not running
  if (!isConnected && error) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">CLIProxy Control Panel</h2>
          </div>
          <button
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border rounded-md hover:bg-muted"
            onClick={handleRefresh}
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center bg-muted/20">
          <div className="text-center max-w-md px-8">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold mb-2">CLIProxy Not Available</h3>
            <p className="text-muted-foreground mb-4">{error}</p>
            <p className="text-sm text-muted-foreground">
              Start a CLIProxy session with{' '}
              <code className="bg-muted px-1 rounded">ccs gemini</code> or run{' '}
              <code className="bg-muted px-1 rounded">ccs config</code> which auto-starts it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 flex flex-col relative">
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {isRemote
                  ? `Loading Control Panel from ${displayHost}...`
                  : 'Loading Control Panel...'}
              </p>
            </div>
          </div>
        )}

        {/* Iframe */}
        <iframe
          key={`${managementUrl}:${iframeRevision}`}
          ref={iframeRef}
          src={managementUrl}
          className="flex-1 w-full border-0"
          title="CLIProxy Management Panel"
          onLoad={handleIframeLoad}
        />
      </div>
    </div>
  );
}
