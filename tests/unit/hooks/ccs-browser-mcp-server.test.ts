import { afterEach, describe, expect, it } from 'bun:test';
import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import * as http from 'node:http';
import { WebSocketServer } from 'ws';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type JsonRpcMessage = Record<string, unknown>;

type MockPageState = {
  id: string;
  title: string;
  currentUrl: string;
  readyStateSequence?: string[];
  visibleText?: string;
  domSnapshot?: string;
  navigate?: Record<string, { finalUrl: string; readyStates?: string[]; errorText?: string }>;
  click?: Record<
    string,
    {
      error?: string;
      disabled?: boolean;
      detached?: boolean;
      hidden?: boolean;
      requireMouseSequence?: boolean;
      requireNativeClick?: boolean;
      forbidSyntheticClickEvent?: boolean;
      cancelMouseDown?: boolean;
      cancelMouseUp?: boolean;
      detachAfterMouseDown?: boolean;
      mouseSequenceError?: string;
    }
  >;
  screenshot?: {
    data?: string;
    lastCaptureBeyondViewport?: boolean;
  };
  type?: Record<
    string,
    {
      kind: 'input' | 'textarea' | 'contenteditable' | 'unsupported' | 'noneditable';
      inputType?: string;
      value?: string;
      expectedValueWhenClearFirst?: string;
      expectedValueWhenAppend?: string;
      requireFocus?: boolean;
      focused?: boolean;
    }
  >;
};

const serverPath = join(process.cwd(), 'lib', 'mcp', 'ccs-browser-server.cjs');

function encodeMessage(message: unknown): string {
  return `${JSON.stringify(message)}\n`;
}

function collectResponses(
  child: ReturnType<typeof spawn>,
  expectedCount: number
): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const responses: Array<Record<string, unknown>> = [];
    const timer = setTimeout(() => reject(new Error('Timed out waiting for MCP responses')), 7000);

    function tryParse(): void {
      while (true) {
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) {
          return;
        }

        const body = buffer.subarray(0, newlineIndex).toString('utf8').replace(/\r$/, '').trim();
        buffer = buffer.subarray(newlineIndex + 1);
        if (!body) {
          continue;
        }

        responses.push(JSON.parse(body) as Record<string, unknown>);
        if (responses.length >= expectedCount) {
          clearTimeout(timer);
          resolve(responses);
          return;
        }
      }
    }

    if (!child.stdout) {
      clearTimeout(timer);
      reject(new Error('MCP child stdout is unavailable'));
      return;
    }

    child.stdout.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        tryParse();
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function getResponseText(message: Record<string, unknown> | undefined): string {
  const result = (message?.result as { content?: Array<{ text?: string }> }) || {};
  return result.content?.[0]?.text || '';
}

function parseJsonArgument(expression: string, key: string): string | undefined {
  const marker = `const ${key} = JSON.parse(`;
  const start = expression.indexOf(marker);
  if (start === -1) {
    return undefined;
  }

  const quoteStart = start + marker.length;
  const quote = expression[quoteStart];
  if (quote !== '"' && quote !== "'") {
    return undefined;
  }

  let index = quoteStart + 1;
  while (index < expression.length) {
    if (expression[index] === '\\') {
      index += 2;
      continue;
    }
    if (expression[index] === quote) {
      const encoded = expression.slice(quoteStart, index + 1);
      const decoded = JSON.parse(encoded) as string;
      if (!decoded.startsWith('"') && !decoded.startsWith("'")) {
        return undefined;
      }
      return JSON.parse(decoded) as string;
    }
    index += 1;
  }

  return undefined;
}

function createMockBrowser(pagesInput: MockPageState[]) {
  let tempDir = '';
  let httpServer: http.Server | null = null;
  let wsServer: WebSocketServer | null = null;
  const pageStates = new Map<string, MockPageState>();

  for (const [index, page] of pagesInput.entries()) {
    pageStates.set(`/devtools/page/${index + 1}`, {
      visibleText: 'Hello from visible text',
      domSnapshot: '<html><body>Hello from DOM snapshot</body></html>',
      ...page,
    });
  }

  async function start() {
    tempDir = mkdtempSync(join(tmpdir(), 'ccs-browser-mcp-server-'));

    const port = await new Promise<number>((resolve, reject) => {
      httpServer = http.createServer((req, res) => {
        if (req.url === '/json/list') {
          const address = httpServer?.address();
          const serverPort = address && typeof address !== 'string' ? address.port : 0;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify(
              Array.from(pageStates.entries()).map(([wsPath, page]) => ({
                id: page.id,
                type: 'page',
                title: page.title,
                url: page.currentUrl,
                webSocketDebuggerUrl: `ws://127.0.0.1:${serverPort}${wsPath}`,
              }))
            )
          );
          return;
        }
        res.writeHead(404);
        res.end('not found');
      });

      httpServer.once('error', reject);
      httpServer.listen(0, '127.0.0.1', () => {
        const address = httpServer?.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to resolve mock browser server port'));
          return;
        }
        resolve(address.port);
      });
    });

    wsServer = new WebSocketServer({ server: httpServer as http.Server });
    wsServer.on('connection', (socket, request) => {
      const page = pageStates.get(request.url || '');
      if (!page) {
        socket.close();
        return;
      }

      socket.on('message', (raw) => {
        const message = JSON.parse(raw.toString()) as {
          id: number;
          method: string;
          params?: Record<string, unknown>;
        };

        function reply(result: unknown): void {
          socket.send(JSON.stringify({ id: message.id, result }));
        }

        function replyError(errorText: string): void {
          socket.send(JSON.stringify({ id: message.id, result: { result: { subtype: 'error', description: errorText } } }));
        }

        if (message.method === 'Page.navigate') {
          const targetUrl = typeof message.params?.url === 'string' ? message.params.url : '';
          const navigatePlan = page.navigate?.[targetUrl];
          if (navigatePlan?.errorText) {
            reply({ frameId: 'frame-1', errorText: navigatePlan.errorText });
            return;
          }
          if (navigatePlan) {
            page.currentUrl = navigatePlan.finalUrl;
            page.readyStateSequence = [...(navigatePlan.readyStates || ['loading', 'interactive'])];
          }
          reply({ frameId: 'frame-1' });
          return;
        }

        if (message.method === 'Page.captureScreenshot') {
          if (!page.screenshot) {
            reply({ data: '' });
            return;
          }
          page.screenshot.lastCaptureBeyondViewport = message.params?.captureBeyondViewport === true;
          reply({ data: page.screenshot.data || '' });
          return;
        }

        if (message.method !== 'Runtime.evaluate') {
          return;
        }

        const expression = String(message.params?.expression || '');

        if (expression.includes('document.title') && expression.includes('location.href')) {
          reply({ result: { type: 'string', value: JSON.stringify({ title: page.title, url: page.currentUrl }) } });
          return;
        }

        if (expression.includes('document.body ? document.body.innerText')) {
          reply({ result: { type: 'string', value: page.visibleText || '' } });
          return;
        }

        if (expression.includes('document.documentElement ? document.documentElement.outerHTML')) {
          reply({ result: { type: 'string', value: page.domSnapshot || '' } });
          return;
        }

        if (expression.includes('document.readyState') && expression.includes('location.href')) {
          const readyState = page.readyStateSequence?.shift() || 'complete';
          reply({
            result: {
              type: 'string',
              value: JSON.stringify({ href: page.currentUrl, readyState }),
            },
          });
          return;
        }

        if (expression.includes('scrollIntoView') && expression.includes('.click()')) {
          const selector = parseJsonArgument(expression, 'selector') || '';
          const clickPlan = page.click?.[selector];
          const attemptedMouseDown = expression.includes("dispatchMouseEvent('mousedown'");
          const attemptedMouseUp = expression.includes("dispatchMouseEvent('mouseup'");
          const attemptedMouseSequence = attemptedMouseDown && attemptedMouseUp;
          const attemptedClickEvent = expression.includes("dispatchMouseEvent('click'");
          const readsDispatchResult = expression.includes('const dispatchResult = {');
          const gatesNativeClickOnDispatchResult = expression.includes('if (!dispatchResult.shouldActivate)');
          const checksIsConnectedBeforeNativeClick = expression.includes('if (!element.isConnected)');
          const catchIndex = expression.indexOf('catch (mouseError) {');
          const catchBlockEnd = catchIndex === -1 ? -1 : expression.indexOf('\n    }', catchIndex);
          const nativeClickIndexes = Array.from(expression.matchAll(/element\.click\(\)/g)).map(
            (match) => match.index ?? -1
          );
          const attemptedFallbackClick = nativeClickIndexes.some(
            (index) => catchIndex !== -1 && catchBlockEnd !== -1 && index > catchIndex && index < catchBlockEnd
          );
          const attemptedNativeClickOutsideCatch = nativeClickIndexes.some(
            (index) =>
              catchIndex === -1 || catchBlockEnd === -1 || index < catchIndex || index > catchBlockEnd
          );
          if (!clickPlan) {
            replyError(`element not found for selector: ${selector}`);
            return;
          }
          if (clickPlan.detached && expression.includes('element.isConnected')) {
            replyError(`element is detached for selector: ${selector}`);
            return;
          }
          if (clickPlan.disabled) {
            replyError(`element is disabled for selector: ${selector}`);
            return;
          }
          if (clickPlan.hidden && expression.includes('getBoundingClientRect')) {
            replyError(`element is hidden or not interactable for selector: ${selector}`);
            return;
          }
          if (clickPlan.requireMouseSequence && !attemptedMouseSequence) {
            replyError(`mousedown/mouseup required for selector: ${selector}`);
            return;
          }
          if (clickPlan.forbidSyntheticClickEvent && attemptedClickEvent) {
            replyError(`synthetic click event forbidden for selector: ${selector}`);
            return;
          }
          if ((clickPlan.cancelMouseDown || clickPlan.cancelMouseUp) && !readsDispatchResult) {
            replyError(`dispatch result must be checked for selector: ${selector}`);
            return;
          }
          if ((clickPlan.cancelMouseDown || clickPlan.cancelMouseUp) && !gatesNativeClickOnDispatchResult) {
            replyError(`native click must be gated for selector: ${selector}`);
            return;
          }
          if (clickPlan.detachAfterMouseDown && !checksIsConnectedBeforeNativeClick) {
            replyError(`connected state must be rechecked for selector: ${selector}`);
            return;
          }
          if (clickPlan.requireNativeClick && !attemptedNativeClickOutsideCatch) {
            replyError(`native click required for selector: ${selector}`);
            return;
          }
          if (clickPlan.mouseSequenceError) {
            if (!attemptedMouseSequence) {
              replyError(`mousedown/mouseup required for selector: ${selector}`);
              return;
            }
            if (attemptedFallbackClick || attemptedNativeClickOutsideCatch) {
              reply({ result: { type: 'string', value: 'ok' } });
              return;
            }
            replyError(clickPlan.mouseSequenceError);
            return;
          }
          if (clickPlan.error) {
            replyError(clickPlan.error);
            return;
          }
          reply({ result: { type: 'string', value: 'ok' } });
          return;
        }

        if (expression.includes('focusTarget') && expression.includes('typedLength')) {
          const selector = parseJsonArgument(expression, 'selector') || '';
          const text = parseJsonArgument(expression, 'text') ?? '';
          const clearFirst = expression.includes('const clearFirst = true');
          const typePlan = page.type?.[selector];
          if (!typePlan) {
            replyError(`element not found for selector: ${selector}`);
            return;
          }
          if (typePlan.kind === 'unsupported') {
            replyError(`element is not text-editable for selector: ${selector}`);
            return;
          }
          if (typePlan.kind === 'noneditable') {
            replyError(`element is not text-editable for selector: ${selector}`);
            return;
          }
          if (typePlan.requireFocus && !expression.includes('focusTarget(element)')) {
            replyError(`focus was not requested for selector: ${selector}`);
            return;
          }

          const currentValue = typePlan.value || '';
          const expectedValue = clearFirst
            ? (typePlan.expectedValueWhenClearFirst ?? text)
            : (typePlan.expectedValueWhenAppend ?? `${currentValue}${text}`);

          typePlan.focused = true;
          typePlan.value = expectedValue;
          reply({
            result: {
              type: 'string',
              value: JSON.stringify({
                value: expectedValue,
                typedLength: expectedValue.length,
              }),
            },
          });
          return;
        }
      });
    });

    const child = spawn('node', [serverPath], {
      cwd: tempDir,
      env: {
        ...process.env,
        CCS_BROWSER_DEVTOOLS_HTTP_URL: `http://127.0.0.1:${port}`,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return child;
  }

  async function stop() {
    await new Promise<void>((resolve) => {
      wsServer?.close(() => resolve());
      if (!wsServer) resolve();
    });
    wsServer = null;

    await new Promise<void>((resolve) => {
      httpServer?.close(() => resolve());
      if (!httpServer) resolve();
    });
    httpServer = null;

    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  }

  return { start, stop };
}

async function runMcpRequests(pages: MockPageState[], requests: JsonRpcMessage[]) {
  const browser = createMockBrowser(pages);
  const child = await browser.start();

  try {
    const responsesPromise = collectResponses(child, requests.length + 1);
    child.stdin.write(
      encodeMessage({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'bun-test', version: '1.0.0' },
        },
      })
    );

    for (const request of requests) {
      child.stdin.write(encodeMessage(request));
    }

    return await responsesPromise;
  } finally {
    child.kill();
    await browser.stop();
  }
}

describe('ccs-browser MCP server', () => {
  afterEach(() => {
    // Cleanup is handled per test via runMcpRequests/createMockBrowser.
  });

  it('lists browser tools including navigate, click, type, and screenshot', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Example Page', currentUrl: 'https://example.com/' }],
      [{ jsonrpc: '2.0', id: 2, method: 'tools/list' }]
    );

    const tools = (responses.find((message) => message.id === 2)?.result as {
      tools: Array<{
        name: string;
        description?: string;
        inputSchema?: { properties?: Record<string, { type?: string; minimum?: number }> };
      }>;
    }).tools;

    expect(tools.map((tool) => tool.name)).toEqual([
      'browser_get_session_info',
      'browser_get_url_and_title',
      'browser_get_visible_text',
      'browser_get_dom_snapshot',
      'browser_navigate',
      'browser_click',
      'browser_type',
      'browser_take_screenshot',
    ]);

    const clickTool = tools.find((tool) => tool.name === 'browser_click');
    expect(clickTool?.description).toContain('mouse event chain');
    expect(clickTool?.description).not.toContain('synthetic element.click()');

    for (const tool of tools.filter((candidate) => candidate.inputSchema?.properties?.pageIndex)) {
      expect(tool.inputSchema?.properties?.pageIndex).toMatchObject({
        type: 'integer',
        minimum: 0,
      });
    }
  });

  it('navigates successfully after readiness polling', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          navigate: {
            'https://example.com/next': {
              finalUrl: 'https://example.com/next',
              readyStates: ['loading', 'interactive'],
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'browser_navigate',
            arguments: { url: 'https://example.com/next' },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 2));
    expect(text).toContain('pageIndex: 0');
    expect(text).toContain('url: https://example.com/next');
    expect(text).toContain('status: navigated');
  });

  it(
    'returns a handled error when navigation readiness times out',
    async () => {
      const responses = await runMcpRequests(
        [
          {
            id: 'page-1',
            title: 'Example Page',
            currentUrl: 'https://example.com/',
            navigate: {
              'https://example.com/slow': {
                finalUrl: 'https://example.com/',
                readyStates: new Array(60).fill('loading'),
              },
            },
          },
        ],
        [
          {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
              name: 'browser_navigate',
              arguments: { url: 'https://example.com/slow' },
            },
          },
        ]
      );

      const response = responses.find((message) => message.id === 2);
      expect((response?.result as { isError?: boolean }).isError).toBe(true);
      expect(getResponseText(response)).toContain('Browser MCP failed: navigation did not complete');
    },
    8000
  );

  it('returns handled errors for missing URL, malformed URL, invalid page index, and out-of-range page index', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Example Page', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'browser_navigate', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'browser_navigate', arguments: { url: 'file:///tmp/example' } },
        },
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'browser_navigate', arguments: { pageIndex: 1.5, url: 'https://example.com/next' } },
        },
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: { name: 'browser_navigate', arguments: { pageIndex: 9, url: 'https://example.com/next' } },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 2))).toContain('Browser MCP failed: url is required');
    expect(getResponseText(responses.find((message) => message.id === 3))).toContain(
      'Browser MCP failed: url must be an absolute http or https URL'
    );
    expect(getResponseText(responses.find((message) => message.id === 4))).toContain(
      'Browser MCP failed: pageIndex must be a non-negative integer'
    );
    expect(getResponseText(responses.find((message) => message.id === 5))).toContain('page index 9 is out of range');
  });

  it('surfaces Page.navigate CDP failures as handled errors', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/start',
          navigate: {
            'https://example.com/fail': {
              finalUrl: 'https://example.com/start',
              errorText: 'net::ERR_ABORTED',
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'browser_navigate',
            arguments: { url: 'https://example.com/fail' },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 2);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain(
      'Browser MCP failed: navigation failed for URL: https://example.com/fail: net::ERR_ABORTED'
    );
  });

  it('treats redirects as successful navigation', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/start',
          navigate: {
            'https://example.com/redirect': {
              finalUrl: 'https://example.com/final',
              readyStates: ['loading', 'interactive'],
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'browser_navigate',
            arguments: { url: 'https://example.com/redirect' },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 2));
    expect(text).toContain('status: navigated');
    expect(text).toContain('url: https://example.com/final');
  });

  it('clicks matching elements and reports selector failures', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          click: {
            '#submit': {},
            '#disabled': { disabled: true },
            '#throws': { error: 'click exploded' },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#submit' } },
        },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#missing' } },
        },
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#disabled' } },
        },
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#throws' } },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 2))).toContain('status: clicked');
    expect(getResponseText(responses.find((message) => message.id === 2))).toContain('selector: #submit');

    const selectorMiss = responses.find((message) => message.id === 3);
    expect((selectorMiss?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(selectorMiss)).toContain('element not found for selector: #missing');

    const disabledError = responses.find((message) => message.id === 4);
    expect((disabledError?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(disabledError)).toContain('element is disabled for selector: #disabled');

    const pageSideError = responses.find((message) => message.id === 5);
    expect((pageSideError?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(pageSideError)).toContain('click exploded');
  });

  it('reports detached and hidden click targets as handled errors', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          click: {
            '#hidden': { hidden: true },
            '#detached': { detached: true },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#hidden' } },
        },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#detached' } },
        },
      ]
    );

    const hiddenError = responses.find((message) => message.id === 2);
    expect((hiddenError?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(hiddenError)).toContain('element is hidden or not interactable for selector: #hidden');

    const detachedError = responses.find((message) => message.id === 3);
    expect((detachedError?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(detachedError)).toContain('element is detached for selector: #detached');
  });

  it('uses a mouse sequence when the target requires it', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          click: {
            '#menu-trigger': { requireMouseSequence: true },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#menu-trigger' } },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 2))).toContain('status: clicked');
    expect(getResponseText(responses.find((message) => message.id === 2))).toContain('selector: #menu-trigger');
  });

  it('preserves mouse sequence preparation without dispatching a synthetic click event', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          click: {
            '#click-event': {
              requireMouseSequence: true,
              forbidSyntheticClickEvent: true,
              requireNativeClick: true,
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#click-event' } },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 2))).toContain('status: clicked');
    expect(getResponseText(responses.find((message) => message.id === 2))).toContain('selector: #click-event');
  });

  it('preserves native click activation after the mouse sequence', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          click: {
            '#native-click': {
              requireMouseSequence: true,
              requireNativeClick: true,
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#native-click' } },
        },
      ]
    );

    const clickResponse = responses.find((message) => message.id === 2);
    expect((clickResponse?.result as { isError?: boolean }).isError).not.toBe(true);
    expect(getResponseText(clickResponse)).toContain('status: clicked');
    expect(getResponseText(clickResponse)).toContain('selector: #native-click');
  });

  it('does not force activation when mousedown cancels the interaction', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          click: {
            '#cancel-mousedown': {
              requireMouseSequence: true,
              cancelMouseDown: true,
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#cancel-mousedown' } },
        },
      ]
    );

    const clickResponse = responses.find((message) => message.id === 2);
    expect((clickResponse?.result as { isError?: boolean }).isError).not.toBe(true);
    expect(getResponseText(clickResponse)).toContain('status: clicked');
    expect(getResponseText(clickResponse)).toContain('selector: #cancel-mousedown');
  });

  it('rechecks connectivity before native activation after the mouse sequence', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          click: {
            '#detached-during-click': {
              requireMouseSequence: true,
              requireNativeClick: true,
              detachAfterMouseDown: true,
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#detached-during-click' } },
        },
      ]
    );

    const clickResponse = responses.find((message) => message.id === 2);
    expect((clickResponse?.result as { isError?: boolean }).isError).not.toBe(true);
    expect(getResponseText(clickResponse)).toContain('status: clicked');
    expect(getResponseText(clickResponse)).toContain('selector: #detached-during-click');
  });

  it('falls back to click when mouse sequence dispatch fails', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          click: {
            '#fallback': { mouseSequenceError: 'mouse dispatch exploded' },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '#fallback' } },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 2))).toContain('status: clicked');
    expect(getResponseText(responses.find((message) => message.id === 2))).toContain('selector: #fallback');
  });

  it('captures screenshots and reports empty payload failures', async () => {
    const screenshotPlan: MockPageState['screenshot'] = { data: 'c2NyZWVuc2hvdA==' };
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          screenshot: screenshotPlan,
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'browser_take_screenshot',
            arguments: { fullPage: true },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 2));
    expect(text).toContain('pageIndex: 0');
    expect(text).toContain('format: png');
    expect(text).toContain('fullPage: true');
    expect(text).toContain('data: c2NyZWVuc2hvdA==');
    expect(screenshotPlan.lastCaptureBeyondViewport).toBe(true);

    const errorResponses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          screenshot: { data: '' },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'browser_take_screenshot',
            arguments: {},
          },
        },
      ]
    );

    const errorResponse = errorResponses.find((message) => message.id === 2);
    expect((errorResponse?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(errorResponse)).toContain('Browser MCP failed: screenshot capture failed');
  });

  it('types into supported editable targets with explicit focus and final-value verification, and rejects unsupported targets', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Example Page',
          currentUrl: 'https://example.com/',
          type: {
            'input[name="email"]': {
              kind: 'input',
              inputType: 'email',
              value: 'old@example.com',
              expectedValueWhenAppend: 'old@example.comhi@example.com',
              requireFocus: true,
            },
            '#notes': {
              kind: 'textarea',
              value: 'old note',
              expectedValueWhenClearFirst: '',
              requireFocus: true,
            },
            '#editor': {
              kind: 'contenteditable',
              value: 'old content',
              expectedValueWhenAppend: 'old contentrich text',
              requireFocus: true,
            },
            '#color': { kind: 'unsupported', inputType: 'color', value: '#ff0000' },
            '#plain': { kind: 'noneditable', value: 'plain' },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'browser_type',
            arguments: { selector: 'input[name="email"]', text: 'hi@example.com' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'browser_type',
            arguments: { selector: '#notes', text: '', clearFirst: true },
          },
        },
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'browser_type',
            arguments: { selector: '#editor', text: 'rich text' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {
            name: 'browser_type',
            arguments: { selector: '#color', text: 'ignored' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 6,
          method: 'tools/call',
          params: {
            name: 'browser_type',
            arguments: { selector: '#plain', text: 'ignored' },
          },
        },
      ]
    );

    const typed = getResponseText(responses.find((message) => message.id === 2));
    expect(typed).toContain('status: typed');
    expect(typed).toContain('selector: input[name="email"]');
    expect(typed).toContain('typedLength: 29');

    const clearFirst = getResponseText(responses.find((message) => message.id === 3));
    expect(clearFirst).toContain('status: typed');
    expect(clearFirst).toContain('selector: #notes');
    expect(clearFirst).toContain('typedLength: 0');

    const contenteditable = getResponseText(responses.find((message) => message.id === 4));
    expect(contenteditable).toContain('status: typed');
    expect(contenteditable).toContain('selector: #editor');
    expect(contenteditable).toContain('typedLength: 20');

    const unsupported = responses.find((message) => message.id === 5);
    expect((unsupported?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(unsupported)).toContain('element is not text-editable for selector: #color');

    const nonEditable = responses.find((message) => message.id === 6);
    expect((nonEditable?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(nonEditable)).toContain('element is not text-editable for selector: #plain');
  });
});
