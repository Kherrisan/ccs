import * as http from 'http';
import { Agent } from 'undici';
import type { OpenAICompatProfileConfig } from '../profile-router';
import { OPENAI_COMPAT_PROXY_SERVICE_NAME } from '../proxy-daemon-paths';
import { createLogger } from '../../services/logging';
import {
  handleProxyMessagesRequest,
  handleProxyModelsRequest,
  validateIncomingProxyAuth,
} from './messages-route';
import { writeJson } from './http-helpers';

export interface OpenAICompatProxyServerOptions {
  profile: OpenAICompatProfileConfig;
  host?: string;
  port: number;
  authToken: string;
  insecure?: boolean;
}

export function startOpenAICompatProxyServer(options: OpenAICompatProxyServerOptions): http.Server {
  const host = options.host?.trim() || '127.0.0.1';
  const logger = createLogger('proxy:openai-compat', {
    profileName: options.profile.profileName,
    host,
    port: options.port,
  });
  const insecureDispatcher = options.insecure
    ? new Agent({ connect: { rejectUnauthorized: false } })
    : undefined;
  const server = http.createServer(async (req, res) => {
    const method = req.method || 'GET';
    const requestUrl = req.url || '/';
    const parsedUrl = new URL(requestUrl, 'http://127.0.0.1');
    const pathname =
      parsedUrl.pathname.length > 1 ? parsedUrl.pathname.replace(/\/+$/, '') : parsedUrl.pathname;

    if ((method === 'GET' || method === 'HEAD') && pathname === '/health') {
      if (method === 'HEAD') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end();
      } else {
        writeJson(res, 200, {
          ok: true,
          service: OPENAI_COMPAT_PROXY_SERVICE_NAME,
          host,
          profile: options.profile.profileName,
          port: options.port,
        });
      }
      return;
    }

    if ((method === 'GET' || method === 'HEAD') && pathname === '/') {
      if (method === 'HEAD') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end();
      } else {
        writeJson(res, 200, {
          ok: true,
          service: OPENAI_COMPAT_PROXY_SERVICE_NAME,
          bind: {
            host,
            port: options.port,
          },
          profile: {
            name: options.profile.profileName,
            provider: options.profile.provider,
            model: options.profile.model || null,
          },
          endpoints: ['/health', '/v1/messages', '/v1/models'],
        });
      }
      return;
    }

    if (method === 'GET' && pathname === '/v1/models') {
      if (!validateIncomingProxyAuth(req.headers, options.authToken)) {
        writeJson(res, 401, {
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Missing or invalid local proxy token',
          },
        });
        return;
      }
      handleProxyModelsRequest(res, options.profile);
      return;
    }

    if (method === 'POST' && pathname === '/v1/messages') {
      await handleProxyMessagesRequest(
        req,
        res,
        options.profile,
        options.authToken,
        insecureDispatcher
      );
      return;
    }

    logger.warn('http.not_found', 'Rejected unknown proxy route', {
      method,
      pathname,
    });
    writeJson(res, 404, { error: 'Not found' });
  });

  logger.info('server.start', 'OpenAI-compatible proxy server listening', {
    baseUrl: `http://${host}:${options.port}`,
  });
  server.on('close', () => {
    logger.info('server.stop', 'OpenAI-compatible proxy server stopped');
    void insecureDispatcher?.close();
  });

  server.listen(options.port, host);
  return server;
}
