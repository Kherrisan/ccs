import * as https from 'https';
import {
  buildManagementHeaders,
  buildProxyUrl,
  getProxyTarget,
  type ProxyTarget,
} from './proxy-target-resolver';

const ROUTING_TIMEOUT_MS = 5000;

export async function fetchCliproxyRoutingResponse(
  target: ProxyTarget,
  method: 'GET' | 'PUT',
  body?: Record<string, string>
): Promise<Response> {
  const url = buildProxyUrl(target, '/routing/strategy');
  const headers = buildManagementHeaders(
    target,
    body ? { 'Content-Type': 'application/json' } : {}
  );

  if (target.protocol !== 'https' || !target.allowSelfSigned) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ROUTING_TIMEOUT_MS);

    try {
      return await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return new Promise<Response>((resolve, reject) => {
    const agent = new https.Agent({ rejectUnauthorized: false });
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      callback();
    };

    const timeoutId = setTimeout(() => {
      const error = new Error('Request timeout');
      req.destroy(error);
      settle(() => reject(error));
    }, ROUTING_TIMEOUT_MS);

    const req = https.request(
      url,
      {
        method,
        headers,
        agent,
        timeout: ROUTING_TIMEOUT_MS,
      },
      (res) => {
        let payload = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          payload += chunk;
        });
        res.on('end', () => {
          settle(() =>
            resolve(
              new Response(payload, {
                status: res.statusCode || 500,
                statusText: res.statusMessage ?? '',
                headers:
                  typeof res.headers['content-type'] === 'string'
                    ? { 'Content-Type': res.headers['content-type'] }
                    : undefined,
              })
            )
          );
        });
      }
    );

    req.on('error', (error) => {
      settle(() => reject(error));
    });

    req.on('timeout', () => {
      const error = new Error('Request timeout');
      req.destroy(error);
      settle(() => reject(error));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

export function getCliproxyRoutingTarget(): ProxyTarget {
  return getProxyTarget();
}

export function getRoutingErrorMessage(response: Response, fallback: string): Promise<string> {
  return response
    .json()
    .then((data) => {
      if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
        return data.error;
      }
      return fallback;
    })
    .catch(() => fallback);
}
