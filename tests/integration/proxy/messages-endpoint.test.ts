import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import getPort from 'get-port';
import * as http from 'http';
import { startOpenAICompatProxyServer } from '../../../src/proxy/server/proxy-server';
import type { OpenAICompatProfileConfig } from '../../../src/proxy/profile-router';

let upstreamServer: http.Server;
let proxyServer: http.Server;
let upstreamBody: unknown;
let upstreamPort: number;
let proxyPort: number;

function startMockUpstream(): Promise<void> {
  return new Promise((resolve) => {
    upstreamServer = http.createServer(async (req, res) => {
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
        res.writeHead(404).end();
        return;
      }

      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
      }
      upstreamBody = JSON.parse(body);
      const parsed = upstreamBody as {
        stream?: boolean;
        messages?: Array<{ role?: string; content?: string | Array<{ type?: string; text?: string }> }>;
      };

      if (parsed.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });

        if (parsed.messages?.[0]?.content === 'interleaved tool fragments') {
          res.write(
            'data: {"id":"chatcmpl_1","model":"hf-model","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"search"}}]}}]}\n\n'
          );
          res.write(
            'data: {"id":"chatcmpl_1","model":"hf-model","choices":[{"index":0,"delta":{"tool_calls":[{"index":1,"id":"call_2","type":"function","function":{"name":"open"}}]}}]}\n\n'
          );
          res.write(
            'data: {"id":"chatcmpl_1","model":"hf-model","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"path\\":\\"a.ts\\"}"}}]}}]}\n\n'
          );
          res.write(
            'data: {"id":"chatcmpl_1","model":"hf-model","choices":[{"index":0,"delta":{"tool_calls":[{"index":1,"function":{"arguments":"{\\"path\\":\\"b.ts\\"}"}}]}}]}\n\n'
          );
          res.write(
            'data: {"id":"chatcmpl_1","model":"hf-model","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":9,"completion_tokens":4}}\n\n'
          );
          res.end('data: [DONE]\n\n');
          return;
        }

        res.write(
          'data: {"id":"chatcmpl_1","model":"hf-model","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"}}]}\n\n'
        );
        res.write(
          'data: {"id":"chatcmpl_1","model":"hf-model","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"search","arguments":"{\\"q\\":\\"docs\\"}"}}]}}]}\n\n'
        );
        res.write(
          'data: {"id":"chatcmpl_1","model":"hf-model","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":9,"completion_tokens":4}}\n\n'
        );
        res.end('data: [DONE]\n\n');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'chatcmpl_1',
          model: 'hf-model',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Plain answer' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 2, completion_tokens: 3 },
        })
      );
    });

    upstreamServer.listen(upstreamPort, '127.0.0.1', () => resolve());
  });
}

async function requestProxy(payload: unknown): Promise<Response> {
  return fetch(`http://127.0.0.1:${proxyPort}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': 'test-proxy-token',
    },
    body: JSON.stringify(payload),
  });
}

beforeEach(async () => {
  upstreamPort = await getPort();
  proxyPort = await getPort();
  upstreamBody = undefined;
  await startMockUpstream();
  const profile: OpenAICompatProfileConfig = {
    profileName: 'hf',
    settingsPath: '/tmp/hf.settings.json',
    baseUrl: `http://127.0.0.1:${upstreamPort}`,
    apiKey: 'hf_token',
    provider: 'generic-chat-completion-api',
    model: 'hf-model',
  };
  proxyServer = startOpenAICompatProxyServer({
    profile,
    port: proxyPort,
    authToken: 'test-proxy-token',
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => proxyServer.close(() => resolve()));
  await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
});

describe('openai proxy messages endpoint', () => {
  it('translates Anthropic requests to OpenAI upstream and streams Anthropic SSE back', async () => {
    const response = await requestProxy({
      model: 'hf-model',
      stream: true,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Find docs' }] }],
      tools: [{ name: 'search', description: 'Search docs', input_schema: { type: 'object' } }],
    });

    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain('event: message_start');
    expect(body).toContain('content_block_delta');
    expect(body).toContain('tool_use');
    expect(body).toContain('message_stop');

    const parsedUpstream = upstreamBody as {
      messages?: Array<{ role: string; content: string }>;
      tool_choice?: unknown;
      tools?: Array<{ type: string; function: { name: string } }>;
    };
    expect(parsedUpstream.messages?.[0]).toEqual({ role: 'user', content: 'Find docs' });
    expect(parsedUpstream.tool_choice).toBe('auto');
    expect(parsedUpstream.tools?.[0]?.type).toBe('function');
    expect(parsedUpstream.tools?.[0]?.function.name).toBe('search');
  });

  it('preserves tool schemas and forwards explicit tool_choice semantics upstream', async () => {
    const response = await requestProxy({
      model: 'hf-model',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Search docs' }] }],
      tools: [
        {
          name: 'search',
          description: 'Search docs',
          input_schema: {
            type: 'object',
            properties: {
              q: { type: 'string', pattern: '^[a-z]+$' },
            },
            required: ['q'],
            additionalProperties: true,
          },
        },
      ],
      tool_choice: {
        type: 'tool',
        name: 'search',
        disable_parallel_tool_use: true,
      },
    });

    expect(response.status).toBe(200);

    const parsedUpstream = upstreamBody as {
      tool_choice?: unknown;
      parallel_tool_calls?: boolean;
      tools?: Array<{ type: string; function: { parameters: Record<string, unknown> } }>;
    };

    expect(parsedUpstream.tool_choice).toEqual({
      type: 'function',
      function: { name: 'search' },
    });
    expect(parsedUpstream.parallel_tool_calls).toBe(false);
    expect(parsedUpstream.tools?.[0]?.function.parameters).toEqual({
      type: 'object',
      properties: {
        q: { type: 'string', pattern: '^[a-z]+$' },
      },
      required: ['q'],
      additionalProperties: true,
    });
  });

  it('falls back to Anthropic JSON for non-streaming requests', async () => {
    const response = await requestProxy({
      model: 'hf-model',
      messages: [{ role: 'user', content: 'hello' }],
    });
    const body = (await response.json()) as {
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.type).toBe('message');
    expect(body.content?.[0]).toEqual({ type: 'text', text: 'Plain answer' });
  });

  it('returns invalid_request_error for malformed JSON', async () => {
    const response = await fetch(`http://127.0.0.1:${proxyPort}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': 'test-proxy-token',
      },
      body: '{bad-json',
    });
    const body = (await response.json()) as { error?: { type?: string; message?: string } };

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('invalid_request_error');
    expect(body.error?.message).toContain('Invalid JSON');
  });

  it('returns invalid_request_error for orphan tool_result blocks', async () => {
    const response = await requestProxy({
      model: 'hf-model',
      messages: [
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'toolu_orphan', content: 'orphan' }],
        },
      ],
    });

    const body = (await response.json()) as { error?: { type?: string; message?: string } };

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('invalid_request_error');
    expect(body.error?.message).toContain('tool_result requires a preceding assistant tool_use');
  });

  it('rejects requests without the local proxy auth token', async () => {
    const response = await fetch(`http://127.0.0.1:${proxyPort}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'hf-model',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });
    const body = (await response.json()) as { error?: { type?: string } };

    expect(response.status).toBe(401);
    expect(body.error?.type).toBe('authentication_error');
  });

  it('translates supported Anthropic image blocks into OpenAI image_url content', async () => {
    const response = await requestProxy({
      model: 'hf-model',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this' },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'ZmFrZQ==',
              },
            },
          ],
        },
      ],
    });

    expect(response.status).toBe(200);
    const parsedUpstream = upstreamBody as {
      messages?: Array<{
        role: string;
        content: Array<{ type: string; text?: string; image_url?: { url?: string } }>;
      }>;
    };
    expect(parsedUpstream.messages?.[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this' },
        {
          type: 'image_url',
          image_url: { url: 'data:image/png;base64,ZmFrZQ==' },
        },
      ],
    });
  });

  it('accepts query strings and trailing slashes on the messages route', async () => {
    const response = await fetch(`http://127.0.0.1:${proxyPort}/v1/messages/?beta=test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        authorization: 'Bearer test-proxy-token',
      },
      body: JSON.stringify({
        model: 'hf-model',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    expect(response.status).toBe(200);
  });

  it('responds 200 to HEAD / (health probe from Claude Code)', async () => {
    const response = await fetch(`http://127.0.0.1:${proxyPort}/`, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.text()).toBe('');
  });

  it('responds 200 to HEAD /health', async () => {
    const response = await fetch(`http://127.0.0.1:${proxyPort}/health`, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.text()).toBe('');
  });

  it('still responds with body for GET /', async () => {
    const response = await fetch(`http://127.0.0.1:${proxyPort}/`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; service: string; endpoints: string[] };
    expect(body.ok).toBe(true);
    expect(body.endpoints).toContain('/v1/messages');
  });

  it('translates user messages with tool_result followed by text', async () => {
    const response = await requestProxy({
      model: 'hf-model',
      stream: false,
      messages: [
        { role: 'user', content: 'search docs' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me search.' },
            { type: 'tool_use', id: 'toolu_01', name: 'search', input: { q: 'docs' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_01', content: 'found 3 docs' },
            { type: 'text', text: 'What should I do next?' },
          ],
        },
      ],
    });

    expect(response.status).toBe(200);
    const parsedUpstream = upstreamBody as {
      messages?: Array<{ role: string; content: string; tool_call_id?: string }>;
    };
    const roles = parsedUpstream.messages?.map((m) => m.role);
    expect(roles).toEqual(['user', 'assistant', 'tool', 'user']);
    const toolMsg = parsedUpstream.messages?.find((m) => m.role === 'tool');
    expect(toolMsg?.tool_call_id).toBe('toolu_01');
    expect(toolMsg?.content).toBe('found 3 docs');
    const userAfterTool = parsedUpstream.messages?.filter((m) => m.role === 'user');
    expect(userAfterTool?.[1]?.content).toBe('What should I do next?');
  });

  it('rejects text before tool_result blocks when tool results are pending', async () => {
    const response = await requestProxy({
      model: 'hf-model',
      stream: false,
      messages: [
        { role: 'user', content: 'search docs' },
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'toolu_01', name: 'search', input: { q: 'docs' } }],
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'before' },
            { type: 'tool_result', tool_use_id: 'toolu_01', content: 'found 3 docs' },
          ],
        },
      ],
    });

    const body = (await response.json()) as { error?: { type?: string; message?: string } };
    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('invalid_request_error');
    expect(body.error?.message).toContain(
      'text is not allowed before tool_result blocks for pending tool_use ids'
    );
  });

  it('rejects follow-up text between pending tool_result blocks', async () => {
    const response = await requestProxy({
      model: 'hf-model',
      stream: false,
      messages: [
        { role: 'user', content: 'read both files' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'toolu_01', name: 'Read', input: { file_path: 'a.ts' } },
            { type: 'tool_use', id: 'toolu_02', name: 'Read', input: { file_path: 'b.ts' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_01', content: 'content of a' },
            { type: 'text', text: 'Now compare them' },
            { type: 'tool_result', tool_use_id: 'toolu_02', content: 'content of b' },
          ],
        },
      ],
    });

    const body = (await response.json()) as { error?: { type?: string; message?: string } };
    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('invalid_request_error');
    expect(body.error?.message).toContain(
      'text is not allowed between tool_result blocks for pending tool_use ids'
    );
  });

  it('translates parallel tool calls with streaming', async () => {
    const response = await requestProxy({
      model: 'hf-model',
      stream: true,
      messages: [
        { role: 'user', content: 'read both files' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'toolu_01', name: 'Read', input: { file_path: 'a.ts' } },
            { type: 'tool_use', id: 'toolu_02', name: 'Read', input: { file_path: 'b.ts' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_01', content: 'content of a' },
            { type: 'tool_result', tool_use_id: 'toolu_02', content: 'content of b' },
            { type: 'text', text: 'Now compare them' },
          ],
        },
      ],
      tools: [
        {
          name: 'Read',
          description: 'Read a file',
          input_schema: {
            type: 'object',
            properties: { file_path: { type: 'string' } },
            required: ['file_path'],
          },
        },
      ],
    });

    expect(response.status).toBe(200);
    const parsedUpstream = upstreamBody as {
      messages?: Array<{
        role: string;
        content: string;
        tool_call_id?: string;
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
      }>;
    };
    const assistantMsg = parsedUpstream.messages?.find((m) => m.role === 'assistant');
    expect(assistantMsg?.tool_calls?.length).toBe(2);
    expect(assistantMsg?.tool_calls?.[0]?.function.name).toBe('Read');
    expect(assistantMsg?.tool_calls?.[1]?.function.name).toBe('Read');
    const toolMsgs = parsedUpstream.messages?.filter((m) => m.role === 'tool');
    expect(toolMsgs?.length).toBe(2);
    expect(toolMsgs?.[0]?.tool_call_id).toBe('toolu_01');
    expect(toolMsgs?.[1]?.tool_call_id).toBe('toolu_02');
  });

  it('streams interleaved tool call fragments without premature block stops', async () => {
    const response = await requestProxy({
      model: 'hf-model',
      stream: true,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'interleaved tool fragments' }] }],
      tools: [
        {
          name: 'search',
          description: 'Search docs',
          input_schema: { type: 'object', properties: { path: { type: 'string' } } },
        },
        {
          name: 'open',
          description: 'Open a file',
          input_schema: { type: 'object', properties: { path: { type: 'string' } } },
        },
      ],
    });

    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body.match(/event: content_block_start/g)?.length).toBe(2);
    expect(body.match(/event: content_block_stop/g)?.length).toBe(2);

    const stopIndex = body.indexOf('event: content_block_stop');
    const deltaAIndex = body.indexOf('"partial_json":"{\\"path\\":\\"a.ts\\"}"');
    const deltaBIndex = body.indexOf('"partial_json":"{\\"path\\":\\"b.ts\\"}"');
    expect(deltaAIndex).toBeGreaterThan(-1);
    expect(deltaBIndex).toBeGreaterThan(-1);
    expect(stopIndex).toBeGreaterThan(deltaBIndex);
  });
});
