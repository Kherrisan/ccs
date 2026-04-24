import * as http from 'http';
import type { Dispatcher } from 'undici';
import type { OpenAICompatProfileConfig } from '../profile-router';
import { resolveProxyRequestRoute } from '../request-router';
import { ProxyRequestTransformer } from '../transformers/request-transformer';
import { ProxySseStreamTransformer } from '../transformers/sse-stream-transformer';
import { resolveOpenAIChatCompletionsUrl } from '../upstream-url';
import { createLogger } from '../../services/logging';
import { pipeWebResponseToNode, readJsonBody, writeJson } from './http-helpers';

const REQUEST_TIMEOUT_MS = 600_000;
const logger = createLogger('proxy:openai-compat:messages');

class ProxyInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProxyInputError';
  }
}

function buildUpstreamHeaders(profile: OpenAICompatProfileConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${profile.apiKey}`,
    'User-Agent': 'CCS-OpenAI-Compat-Proxy/1.0',
  };
}

function buildUpstreamRequest(
  profile: OpenAICompatProfileConfig,
  rawBody: unknown
): { body: string; route: ReturnType<typeof resolveProxyRequestRoute> } {
  let transformed;
  try {
    const transformer = new ProxyRequestTransformer();
    transformed = transformer.transform(rawBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid Anthropic request';
    throw new ProxyInputError(message);
  }
  const route = resolveProxyRequestRoute(profile, transformed);
  const body = {
    ...transformed,
    model: route.model || route.profile.model,
    stream: transformed.stream === true,
  };
  return { body: JSON.stringify(body), route };
}

export function extractIncomingProxyToken(headers: http.IncomingHttpHeaders): string | null {
  const xApiKey = headers['x-api-key'];
  if (typeof xApiKey === 'string' && xApiKey.trim().length > 0) {
    return xApiKey.trim();
  }

  const anthropicApiKey = headers['anthropic-api-key'];
  if (typeof anthropicApiKey === 'string' && anthropicApiKey.trim().length > 0) {
    return anthropicApiKey.trim();
  }

  const authHeader = headers.authorization;
  if (typeof authHeader === 'string' && authHeader.trim().length > 0) {
    const trimmed = authHeader.trim();
    const bearerPrefix = 'Bearer ';
    return trimmed.startsWith(bearerPrefix) ? trimmed.slice(bearerPrefix.length).trim() : trimmed;
  }

  return null;
}

export function validateIncomingProxyAuth(
  headers: http.IncomingHttpHeaders,
  expectedToken: string
): boolean {
  return extractIncomingProxyToken(headers) === expectedToken;
}

function buildFetchInit(
  profile: OpenAICompatProfileConfig,
  body: string,
  signal: AbortSignal,
  insecureDispatcher?: Dispatcher
): RequestInit {
  const init: RequestInit = {
    method: 'POST',
    headers: buildUpstreamHeaders(profile),
    body,
    signal,
  };

  if (insecureDispatcher) {
    (init as Record<string, unknown>).dispatcher = insecureDispatcher;
  }

  return init;
}

function getRequestTimeoutMs(): number {
  const rawValue = process.env.CCS_OPENAI_PROXY_REQUEST_TIMEOUT_MS;
  if (!rawValue) {
    return REQUEST_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : REQUEST_TIMEOUT_MS;
}

function formatTimeoutDuration(timeoutMs: number): string {
  return timeoutMs % 1000 === 0 ? `${timeoutMs / 1000} seconds` : `${timeoutMs}ms`;
}

function registerOnceListener(
  emitter: NodeJS.EventEmitter | null | undefined,
  event: string,
  handler: () => void
): () => void {
  if (!emitter) {
    return () => {};
  }

  emitter.once(event, handler);
  return () => {
    emitter.removeListener(event, handler);
  };
}

export function attachDisconnectAbortHandlers(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  controller: AbortController,
  onDisconnect: (source: string) => void
): () => void {
  const abortOnDisconnect = (source: string) => {
    if (!controller.signal.aborted && !res.writableEnded) {
      onDisconnect(source);
      controller.abort();
    }
  };

  const cleanupFns = [
    registerOnceListener(req, 'aborted', () => abortOnDisconnect('req.aborted')),
    registerOnceListener(req.socket, 'close', () => abortOnDisconnect('req.socket.close')),
    registerOnceListener(res.socket, 'close', () => abortOnDisconnect('res.socket.close')),
  ];

  const disconnectPoll = setInterval(() => {
    if (req.socket?.destroyed === true) {
      abortOnDisconnect('poll.socket.destroyed');
    }
  }, 50);

  return () => {
    clearInterval(disconnectPoll);
    for (const cleanup of cleanupFns) {
      cleanup();
    }
  };
}

export async function handleProxyMessagesRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  profile: OpenAICompatProfileConfig,
  expectedAuthToken: string,
  insecureDispatcher?: Dispatcher
): Promise<void> {
  const transformer = new ProxySseStreamTransformer();

  if (!validateIncomingProxyAuth(req.headers, expectedAuthToken)) {
    logger.warn('auth.invalid', 'Rejected proxy message request with invalid auth token', {
      remoteAddress: req.socket.remoteAddress || null,
    });
    await pipeWebResponseToNode(
      transformer.error(401, 'authentication_error', 'Missing or invalid local proxy token'),
      res
    );
    return;
  }

  let timeoutMs = REQUEST_TIMEOUT_MS;
  try {
    const rawBody = await readJsonBody(req);
    const upstream = buildUpstreamRequest(profile, rawBody);
    logger.info('request.forward', 'Forwarding Anthropic request to OpenAI-compatible upstream', {
      profileName: upstream.route.profile.profileName,
      provider: upstream.route.profile.provider,
      baseUrl: upstream.route.profile.baseUrl,
      model: upstream.route.model || upstream.route.profile.model || null,
      routeSource: upstream.route.source,
      scenario: upstream.route.scenario || null,
      estimatedTokens: upstream.route.estimatedTokens,
    });
    const controller = new AbortController();
    timeoutMs = getRequestTimeoutMs();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const cleanupDisconnectHandlers = attachDisconnectAbortHandlers(
      req,
      res,
      controller,
      (source) => {
        logger.info(
          'request.disconnect',
          'Aborting upstream request after local client disconnect',
          {
            profileName: profile.profileName,
            source,
          }
        );
      }
    );

    try {
      const upstreamResponse = await fetch(
        resolveOpenAIChatCompletionsUrl(upstream.route.profile.baseUrl),
        buildFetchInit(upstream.route.profile, upstream.body, controller.signal, insecureDispatcher)
      );
      logger.info('response.received', 'Received upstream response', {
        profileName: profile.profileName,
        routedProfileName: upstream.route.profile.profileName,
        status: upstreamResponse.status,
      });
      const response = await transformer.transform(upstreamResponse);
      await pipeWebResponseToNode(response, res);
    } finally {
      clearTimeout(timeout);
      cleanupDisconnectHandlers();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown proxy error';
    logger.error('request.failed', 'Proxy message request failed', {
      profileName: profile.profileName,
      error: message,
      abort: error instanceof Error && error.name === 'AbortError',
    });
    const status =
      error instanceof Error && error.name === 'AbortError'
        ? 502
        : error instanceof ProxyInputError
          ? 400
          : message.includes('Request body too large')
            ? 413
            : message.includes('Invalid JSON')
              ? 400
              : 502;
    const type = status >= 500 ? 'api_error' : 'invalid_request_error';
    await pipeWebResponseToNode(
      transformer.error(
        status,
        type,
        error instanceof Error && error.name === 'AbortError'
          ? `The upstream provider did not respond within ${formatTimeoutDuration(timeoutMs)}`
          : message
      ),
      res
    );
  }
}

export function handleProxyModelsRequest(
  res: http.ServerResponse,
  profile: OpenAICompatProfileConfig
): void {
  const data = [profile.model, profile.opusModel, profile.sonnetModel, profile.haikuModel]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((id) => ({
      id,
      object: 'model',
      created: 0,
      owned_by: profile.provider,
    }));

  writeJson(res, 200, { object: 'list', data });
}
