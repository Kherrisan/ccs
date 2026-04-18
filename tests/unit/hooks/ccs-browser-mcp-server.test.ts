import { afterEach, describe, expect, it } from 'bun:test';
import { spawn } from 'child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import { WebSocketServer } from 'ws';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type JsonRpcMessage = Record<string, unknown>;

type MockRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type MockQueryState = {
  exists?: boolean;
  connected?: boolean;
  innerText?: string;
  textContent?: string;
  rect?: MockRect;
  display?: string;
  visibility?: string;
  opacity?: string;
  href?: string;
  onclick?: string;
  error?: string;
};

type MockQueryPlan = MockQueryState | MockQueryState[];

type MockClickState = {
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
  label?: string;
  expectedOffset?: { x: number; y: number };
  expectedButton?: 'left' | 'middle' | 'right';
  expectedClickCount?: number;
  requireDoubleClickEvent?: boolean;
};

type MockClickPlan = MockClickState | MockClickState[];

type MockHoverState = {
  error?: string;
  detached?: boolean;
  hidden?: boolean;
  zeroSized?: boolean;
  requireCdpMouseMove?: boolean;
  lastMouseMove?: {
    x: number;
    y: number;
  };
};

type MockWaitPlan = {
  selectorSnapshots?: Record<string, MockQueryPlan[]>;
  pageTextSequence?: string[];
};

type MockPageEventPlan = {
  dialogs?: Array<{ type: string; message: string }>;
  navigations?: Array<{ url: string; parentId?: string }>;
  requests?: Array<{ url: string; method: string }>;
  downloads?: Array<{ url: string; suggestedFilename: string }>;
};

type MockFrameState = {
  selector: string;
  query?: Record<string, MockQueryPlan>;
  visibleText?: string;
};

type MockShadowRootState = {
  hostSelector: string;
  query?: Record<string, MockQueryPlan>;
};

type MockEvalPlan = Record<
  string,
  {
    result?: unknown;
    error?: string;
    nonSerializable?: boolean;
  }
>;

type MockPageState = {
  id: string;
  title: string;
  currentUrl: string;
  readyStateSequence?: string[];
  visibleText?: string;
  domSnapshot?: string;
  navigate?: Record<string, { finalUrl: string; readyStates?: string[]; errorText?: string }>;
  click?: Record<string, MockClickPlan>;
  hover?: Record<string, MockHoverState>;
  query?: Record<string, MockQueryPlan>;
  wait?: MockWaitPlan;
  eval?: MockEvalPlan;
  frames?: MockFrameState[];
  shadowRoots?: MockShadowRootState[];
  events?: MockPageEventPlan;
  screenshot?: {
    expectedClip?: {
      x: number;
      y: number;
      width: number;
      height: number;
      scale: number;
    };
    requireScrolledMeasurement?: boolean;
    scrolledSelectors?: string[];
    data?: string;
    lastCaptureBeyondViewport?: boolean;
    lastClip?: {
      x: number;
      y: number;
      width: number;
      height: number;
      scale: number;
    };
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
  keyboard?: {
    expectedKey?: string;
    expectedModifiers?: string[];
    expectedRepeat?: number;
    _seenKeyDownCount?: number;
  };
  scroll?: Record<
    string,
    {
      expectedBehavior?: 'into-view' | 'by-offset';
      expectedDeltaX?: number;
      expectedDeltaY?: number;
    }
  >;
};

const bundledServerPath = join(process.cwd(), 'lib', 'mcp', 'ccs-browser-server.cjs');

type RunMcpRequestsOptions = {
  serverPath?: string;
  childEnv?: NodeJS.ProcessEnv;
  responseTimeoutMs?: number;
};

function encodeMessage(message: unknown): string {
  return `${JSON.stringify(message)}\n`;
}

function collectResponses(
  child: ReturnType<typeof spawn>,
  expectedCount: number,
  timeoutMs = 7000
): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    let stderrBuffer = '';
    let settled = false;
    const responses: Array<Record<string, unknown>> = [];
    const fail = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(responses);
    };
    const timer = setTimeout(() => {
      const details = stderrBuffer.trim();
      fail(
        new Error(
          details
            ? `Timed out waiting for MCP responses\n${details}`
            : 'Timed out waiting for MCP responses'
        )
      );
    }, timeoutMs);

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
          finish();
          return;
        }
      }
    }

    if (!child.stdout) {
      fail(new Error('MCP child stdout is unavailable'));
      return;
    }

    child.stdout.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        tryParse();
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderrBuffer += chunk.toString();
    });

    child.on('error', (error) => {
      fail(error);
    });

    child.on('exit', (code, signal) => {
      if (settled || responses.length >= expectedCount) {
        return;
      }
      const details = stderrBuffer.trim();
      const suffix = details ? `\n${details}` : '';
      fail(
        new Error(
          `MCP child exited before all responses arrived (code=${code}, signal=${signal})${suffix}`
        )
      );
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

function parseNumberArgument(expression: string, key: string): number | undefined {
  const match = expression.match(new RegExp(`const ${key} = ([0-9]+|undefined);`));
  if (!match?.[1] || match[1] === 'undefined') {
    return undefined;
  }
  return Number.parseInt(match[1], 10);
}

function pickMockMatch<T>(
  plan: T | T[] | undefined,
  nth = 0
): {
  count: number;
  target: T | undefined;
} {
  if (Array.isArray(plan)) {
    return { count: plan.length, target: plan[nth] };
  }
  return { count: plan ? 1 : 0, target: nth === 0 ? plan : undefined };
}

function shiftSelectorSnapshot(page: MockPageState, selector: string): MockQueryPlan | undefined {
  const queue = page.wait?.selectorSnapshots?.[selector];
  if (!queue || queue.length === 0) {
    return page.query?.[selector];
  }
  if (queue.length === 1) {
    return queue[0];
  }
  return queue.shift();
}

function getMockFrame(page: MockPageState, frameSelector: string): MockFrameState | undefined {
  return page.frames?.find((frame) => frame.selector === frameSelector);
}

function getMockShadowRoot(page: MockPageState): MockShadowRootState | undefined {
  return page.shadowRoots?.[0];
}

function shiftPageText(page: MockPageState): string {
  const queue = page.wait?.pageTextSequence;
  if (!queue || queue.length === 0) {
    return page.visibleText || '';
  }
  if (queue.length === 1) {
    return queue[0] || '';
  }
  return queue.shift() || '';
}

function resolveNodeModulesPath(): string {
  const candidates = [
    join(process.cwd(), 'node_modules'),
    join(process.cwd(), '..', 'node_modules'),
    join(process.cwd(), '..', '..', 'node_modules'),
  ];
  return (
    candidates.find((candidate) => existsSync(join(candidate, 'ws'))) ||
    candidates.find((candidate) => existsSync(candidate)) ||
    candidates[0]
  );
}

function createMockBrowser(pagesInput: MockPageState[]) {
  let tempDir = '';
  let httpServer: http.Server | null = null;
  let wsServer: WebSocketServer | null = null;
  let browserSocketPath = '';
  const pageStates = new Map<string, MockPageState>();

  for (const [index, page] of pagesInput.entries()) {
    pageStates.set(`/devtools/page/${index + 1}`, {
      visibleText: 'Hello from visible text',
      domSnapshot: '<html><body>Hello from DOM snapshot</body></html>',
      ...page,
    });
  }

  async function start(options: RunMcpRequestsOptions = {}) {
    const entryServerPath = options.serverPath || bundledServerPath;
    const childEnv = options.childEnv || {};
    tempDir = mkdtempSync(join(tmpdir(), 'ccs-browser-mcp-server-'));

    const port = await new Promise<number>((resolve, reject) => {
      httpServer = http.createServer((req, res) => {
        if (req.url === '/json/list') {
          const address = httpServer?.address();
          const serverPort = address && typeof address !== 'string' ? address.port : 0;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify([
              ...Array.from(pageStates.entries()).map(([wsPath, page]) => ({
                id: page.id,
                type: 'page',
                title: page.title,
                url: page.currentUrl,
                webSocketDebuggerUrl: `ws://127.0.0.1:${serverPort}${wsPath}`,
              })),
              {
                id: 'browser-target',
                type: 'browser',
                title: 'Browser',
                url: '',
                webSocketDebuggerUrl: `ws://127.0.0.1:${serverPort}${browserSocketPath || '/devtools/browser'}`,
              },
            ])
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

    browserSocketPath = '/devtools/browser';
    wsServer = new WebSocketServer({ server: httpServer as http.Server });
    wsServer.on('connection', (socket, request) => {
      if ((request.url || '') === browserSocketPath) {
        const downloadPage = pagesInput.find(
          (candidate) => (candidate.events?.downloads?.length || 0) > 0
        );
        if (downloadPage?.events?.downloads?.[0]) {
          const download = downloadPage.events.downloads[0];
          setTimeout(() => {
            socket.send(
              JSON.stringify({
                method: 'Browser.downloadWillBegin',
                params: {
                  url: download.url,
                  suggestedFilename: download.suggestedFilename,
                },
              })
            );
          }, 10);
        }
        return;
      }

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
          socket.send(
            JSON.stringify({
              id: message.id,
              result: { result: { subtype: 'error', description: errorText } },
            })
          );
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
          page.screenshot.lastCaptureBeyondViewport =
            message.params?.captureBeyondViewport === true;
          const clip =
            message.params?.clip && typeof message.params.clip === 'object'
              ? (message.params.clip as Record<string, unknown>)
              : null;
          page.screenshot.lastClip = clip
            ? {
                x: Number(clip.x),
                y: Number(clip.y),
                width: Number(clip.width),
                height: Number(clip.height),
                scale: Number(clip.scale),
              }
            : undefined;
          if (page.screenshot.expectedClip) {
            expect(page.screenshot.lastClip).toEqual(page.screenshot.expectedClip);
          }
          reply({ data: page.screenshot.data || '' });
          return;
        }

        if (message.method === 'Input.dispatchMouseEvent') {
          const type = typeof message.params?.type === 'string' ? message.params.type : '';
          const x = Number(message.params?.x);
          const y = Number(message.params?.y);
          for (const hoverPlan of Object.values(page.hover || {})) {
            if (type === 'mouseMoved') {
              hoverPlan.lastMouseMove = { x, y };
            }
          }
          reply({});
          return;
        }

        if (message.method === 'Input.dispatchKeyEvent') {
          const type = typeof message.params?.type === 'string' ? message.params.type : '';
          const key = typeof message.params?.key === 'string' ? message.params.key : '';
          const modifiersMask = Number(message.params?.modifiers || 0);
          const modifiers = [
            ...(modifiersMask & 1 ? ['Alt'] : []),
            ...(modifiersMask & 2 ? ['Control'] : []),
            ...(modifiersMask & 4 ? ['Meta'] : []),
            ...(modifiersMask & 8 ? ['Shift'] : []),
          ];
          const keyboardPlan = page.keyboard;
          if (type === 'keyDown') {
            if (keyboardPlan?.expectedKey && key !== keyboardPlan.expectedKey) {
              replyError(`unexpected key: ${key}`);
              return;
            }
            if (
              keyboardPlan?.expectedModifiers &&
              JSON.stringify(modifiers) !== JSON.stringify(keyboardPlan.expectedModifiers)
            ) {
              replyError(`unexpected modifiers for key: ${key}`);
              return;
            }
            if (keyboardPlan) {
              keyboardPlan._seenKeyDownCount = (keyboardPlan._seenKeyDownCount || 0) + 1;
            }
          }
          if (
            type === 'keyUp' &&
            typeof keyboardPlan?.expectedRepeat === 'number' &&
            (keyboardPlan._seenKeyDownCount || 0) !== keyboardPlan.expectedRepeat
          ) {
            replyError(`unexpected repeat for key: ${key}`);
            return;
          }
          reply({});
          return;
        }

        if (message.method === 'Page.enable' || message.method === 'Network.enable') {
          reply({});
          if (message.method === 'Page.enable') {
            const dialog = page.events?.dialogs?.[0];
            const navigations = page.events?.navigations || [];
            if (dialog) {
              setTimeout(() => {
                socket.send(
                  JSON.stringify({
                    method: 'Page.javascriptDialogOpening',
                    params: { message: dialog.message, type: dialog.type },
                  })
                );
              }, 10);
            }
            navigations.forEach((navigation, index) => {
              setTimeout(
                () => {
                  socket.send(
                    JSON.stringify({
                      method: 'Page.frameNavigated',
                      params: { frame: { url: navigation.url, parentId: navigation.parentId } },
                    })
                  );
                },
                10 + index * 10
              );
            });
          }
          if (message.method === 'Network.enable') {
            const requestPlan = page.events?.requests?.[0];
            if (requestPlan) {
              setTimeout(() => {
                socket.send(
                  JSON.stringify({
                    method: 'Network.requestWillBeSent',
                    params: { request: { url: requestPlan.url, method: requestPlan.method } },
                  })
                );
              }, 10);
            }
          }
          return;
        }

        if (message.method !== 'Runtime.evaluate') {
          return;
        }

        const expression = String(message.params?.expression || '');

        if (page.eval?.[expression]) {
          const evalPlan = page.eval[expression];
          if (evalPlan.error) {
            socket.send(
              JSON.stringify({
                id: message.id,
                result: { exceptionDetails: { text: evalPlan.error } },
              })
            );
            return;
          }
          if (evalPlan.nonSerializable) {
            socket.send(JSON.stringify({ id: message.id, result: { result: { type: 'object' } } }));
            return;
          }
          socket.send(
            JSON.stringify({
              id: message.id,
              result: { result: { type: 'object', value: evalPlan.result } },
            })
          );
          return;
        }

        if (expression.includes('document.title') && expression.includes('location.href')) {
          reply({
            result: {
              type: 'string',
              value: JSON.stringify({ title: page.title, url: page.currentUrl }),
            },
          });
          return;
        }

        if (expression.includes('document.body ? document.body.innerText')) {
          reply({ result: { type: 'string', value: shiftPageText(page) } });
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

        if (expression.includes('scrollIntoView') && expression.includes('resolvedOffsetX')) {
          const selector = parseJsonArgument(expression, 'selector') || '';
          const nth = parseNumberArgument(expression, 'nth') ?? 0;
          const clickPlan = page.click?.[selector];
          const { count, target: resolvedClickPlan } = pickMockMatch(clickPlan, nth);
          const attemptedMouseDown = expression.includes("dispatchMouseEvent('mousedown'");
          const attemptedMouseUp = expression.includes("dispatchMouseEvent('mouseup'");
          const attemptedMouseSequence = attemptedMouseDown && attemptedMouseUp;
          const attemptedClickEvent = expression.includes("dispatchMouseEvent('click'");
          const attemptedDoubleClickEvent = expression.includes("new MouseEvent('dblclick'");
          const readsDispatchResult = expression.includes('const dispatchResult = {');
          const gatesNativeClickOnDispatchResult = expression.includes(
            'if (!dispatchResult.shouldActivate)'
          );
          const checksIsConnectedBeforeNativeClick = expression.includes(
            'if (!element.isConnected)'
          );
          const catchIndex = expression.indexOf('catch (mouseError) {');
          const catchBlockEnd = catchIndex === -1 ? -1 : expression.indexOf('\n    }', catchIndex);
          const nativeClickIndexes = Array.from(expression.matchAll(/element\.click\(\)/g)).map(
            (match) => match.index ?? -1
          );
          const attemptedFallbackClick = nativeClickIndexes.some(
            (index) =>
              catchIndex !== -1 &&
              catchBlockEnd !== -1 &&
              index > catchIndex &&
              index < catchBlockEnd
          );
          const attemptedNativeClickOutsideCatch = nativeClickIndexes.some(
            (index) =>
              catchIndex === -1 ||
              catchBlockEnd === -1 ||
              index < catchIndex ||
              index > catchBlockEnd
          );
          const offsetX = parseNumberArgument(expression, 'offsetX');
          const offsetY = parseNumberArgument(expression, 'offsetY');
          const button = parseJsonArgument(expression, 'button') || 'left';
          const clickCount = parseNumberArgument(expression, 'clickCount') ?? 1;
          if (!resolvedClickPlan) {
            replyError(`element index ${nth} is out of range for selector: ${selector}`);
            return;
          }
          if (count <= nth) {
            replyError(`element index ${nth} is out of range for selector: ${selector}`);
            return;
          }
          if (resolvedClickPlan.detached && expression.includes('element.isConnected')) {
            replyError(`element is detached for selector: ${selector}`);
            return;
          }
          if (resolvedClickPlan.disabled) {
            replyError(`element is disabled for selector: ${selector}`);
            return;
          }
          if (resolvedClickPlan.hidden && expression.includes('getBoundingClientRect')) {
            replyError(`element is hidden or not interactable for selector: ${selector}`);
            return;
          }
          if (resolvedClickPlan.requireMouseSequence && !attemptedMouseSequence) {
            replyError(`mousedown/mouseup required for selector: ${selector}`);
            return;
          }
          if (resolvedClickPlan.forbidSyntheticClickEvent && attemptedClickEvent) {
            replyError(`synthetic click event forbidden for selector: ${selector}`);
            return;
          }
          if (
            (resolvedClickPlan.cancelMouseDown || resolvedClickPlan.cancelMouseUp) &&
            !readsDispatchResult
          ) {
            replyError(`dispatch result must be checked for selector: ${selector}`);
            return;
          }
          if (
            (resolvedClickPlan.cancelMouseDown || resolvedClickPlan.cancelMouseUp) &&
            !gatesNativeClickOnDispatchResult
          ) {
            replyError(`native click must be gated for selector: ${selector}`);
            return;
          }
          if (resolvedClickPlan.detachAfterMouseDown && !checksIsConnectedBeforeNativeClick) {
            replyError(`connected state must be rechecked for selector: ${selector}`);
            return;
          }
          if (resolvedClickPlan.requireNativeClick && !attemptedNativeClickOutsideCatch) {
            replyError(`native click required for selector: ${selector}`);
            return;
          }
          if (
            resolvedClickPlan.expectedOffset &&
            (offsetX !== resolvedClickPlan.expectedOffset.x || offsetY !== resolvedClickPlan.expectedOffset.y)
          ) {
            replyError(`unexpected click offset for selector: ${selector}`);
            return;
          }
          if (resolvedClickPlan.expectedButton && button !== resolvedClickPlan.expectedButton) {
            replyError(`unexpected click button for selector: ${selector}`);
            return;
          }
          if (
            typeof resolvedClickPlan.expectedClickCount === 'number' &&
            clickCount !== resolvedClickPlan.expectedClickCount
          ) {
            replyError(`unexpected click count for selector: ${selector}`);
            return;
          }
          if (
            resolvedClickPlan.requireDoubleClickEvent &&
            clickCount === 2 &&
            !attemptedDoubleClickEvent
          ) {
            replyError(`dblclick event required for selector: ${selector}`);
            return;
          }
          if (resolvedClickPlan.mouseSequenceError) {
            if (!attemptedMouseSequence) {
              replyError(`mousedown/mouseup required for selector: ${selector}`);
              return;
            }
            if (attemptedFallbackClick || attemptedNativeClickOutsideCatch) {
              reply({
                result: {
                  type: 'string',
                  value: JSON.stringify({
                    resolvedOffsetX: offsetX ?? 50,
                    resolvedOffsetY: offsetY ?? 10,
                    button,
                    clickCount,
                  }),
                },
              });
              return;
            }
            replyError(resolvedClickPlan.mouseSequenceError);
            return;
          }
          if (resolvedClickPlan.error) {
            replyError(resolvedClickPlan.error);
            return;
          }
          reply({
            result: {
              type: 'string',
              value: JSON.stringify({
                resolvedOffsetX: offsetX ?? 50,
                resolvedOffsetY: offsetY ?? 10,
                button,
                clickCount,
              }),
            },
          });
          return;
        }

        if (
          expression.includes('getComputedStyle(element)') &&
          (expression.includes('boundingClientRect') ||
            expression.includes('visibleClip') ||
            expression.includes('centerPoint') ||
            expression.includes('querySelectorAll(selector)'))
        ) {
          const selector = parseJsonArgument(expression, 'selector') || '';
          const nth = parseNumberArgument(expression, 'nth');
          const frameSelector = parseJsonArgument(expression, 'frameSelector') || '';
          const pierceShadow = expression.includes('const pierceShadow = true');
          const frame = frameSelector ? getMockFrame(page, frameSelector) : undefined;
          const shadowRoot = pierceShadow ? getMockShadowRoot(page) : undefined;
          const scopedQuery = frame?.query?.[selector] ?? shadowRoot?.query?.[selector];
          const frameRootPlan = frame?.query?.[frameSelector];
          const frameRect = !Array.isArray(frameRootPlan) ? frameRootPlan?.rect : undefined;
          const applyFrameOffset = (rect?: MockRect): MockRect | undefined => {
            if (!rect || !frameRect) {
              return rect;
            }
            return {
              x: rect.x + frameRect.left,
              y: rect.y + frameRect.top,
              width: rect.width,
              height: rect.height,
              top: rect.top + frameRect.top,
              right: rect.right + frameRect.left,
              bottom: rect.bottom + frameRect.top,
              left: rect.left + frameRect.left,
            };
          };
          const queryPlan = scopedQuery ?? shiftSelectorSnapshot(page, selector);
          if (
            page.screenshot?.requireScrolledMeasurement &&
            (selector in (page.query || {}) || Boolean(scopedQuery)) &&
            !expression.includes('scrollIntoView')
          ) {
            replyError(`scrollIntoView required for selector: ${selector}`);
            return;
          }
          if (Array.isArray(queryPlan) && expression.includes('querySelectorAll(selector)')) {
            const targetIndex = nth ?? 0;
            const target = queryPlan[targetIndex];
            if (target?.error) {
              replyError(target.error);
              return;
            }
            if (queryPlan.length <= targetIndex || target?.exists === false || !target) {
              reply({
                result: {
                  type: 'string',
                  value: JSON.stringify({
                    exists:
                      nth === undefined ? queryPlan.length > 0 : queryPlan.length > targetIndex,
                    count: queryPlan.length,
                    targetIndex,
                    targetMissing: true,
                  }),
                },
              });
              return;
            }
            const rect = applyFrameOffset(target.rect);
            const text = target.innerText || target.textContent || '';
            reply({
              result: {
                type: 'string',
                value: JSON.stringify({
                  exists: true,
                  count: queryPlan.length,
                  targetIndex,
                  connected: target.connected !== false,
                  text,
                  innerText: target.innerText || '',
                  textContent: target.textContent || '',
                  boundingClientRect: rect,
                  display: target.display || 'block',
                  visibility: target.visibility || 'visible',
                  opacity: target.opacity || '1',
                  href: target.href || '',
                  onclick: target.onclick || '',
                  interactable:
                    target.connected !== false &&
                    (target.display || 'block') !== 'none' &&
                    (target.visibility || 'visible') !== 'hidden' &&
                    Boolean(rect && rect.width > 0 && rect.height > 0),
                }),
              },
            });
            return;
          }
          const resolvedQueryPlan = Array.isArray(queryPlan) ? queryPlan.shift() : queryPlan;
          if (resolvedQueryPlan?.error) {
            replyError(resolvedQueryPlan.error);
            return;
          }
          if (resolvedQueryPlan?.exists === false || !resolvedQueryPlan) {
            reply({ result: { type: 'string', value: JSON.stringify({ exists: false }) } });
            return;
          }
          const rect = applyFrameOffset(resolvedQueryPlan.rect);
          const text = resolvedQueryPlan.innerText || resolvedQueryPlan.textContent || '';
          const viewportWidth = 1280;
          const viewportHeight = 720;
          const clipX = Math.max(0, rect?.left ?? 0);
          const clipY = Math.max(0, rect?.top ?? 0);
          const clipRight = Math.min(viewportWidth, rect?.right ?? 0);
          const clipBottom = Math.min(viewportHeight, rect?.bottom ?? 0);
          reply({
            result: {
              type: 'string',
              value: JSON.stringify({
                exists: true,
                connected: resolvedQueryPlan.connected !== false,
                text,
                innerText: resolvedQueryPlan.innerText || '',
                textContent: resolvedQueryPlan.textContent || '',
                boundingClientRect: rect,
                display: resolvedQueryPlan.display || 'block',
                visibility: resolvedQueryPlan.visibility || 'visible',
                opacity: resolvedQueryPlan.opacity || '1',
                interactable:
                  resolvedQueryPlan.connected !== false &&
                  (resolvedQueryPlan.display || 'block') !== 'none' &&
                  (resolvedQueryPlan.visibility || 'visible') !== 'hidden' &&
                  Boolean(rect && rect.width > 0 && rect.height > 0),
                centerPoint: rect
                  ? {
                      x: rect.left + rect.width / 2,
                      y: rect.top + rect.height / 2,
                    }
                  : undefined,
                visibleClip: rect
                  ? {
                      x: clipX,
                      y: clipY,
                      width: Math.max(0, clipRight - clipX),
                      height: Math.max(0, clipBottom - clipY),
                      scale: 1,
                    }
                  : undefined,
              }),
            },
          });
          return;
        }

        if (
          expression.includes("dispatch('mouseover')") &&
          expression.includes("dispatch('mouseenter')") &&
          expression.includes("dispatch('mousemove')")
        ) {
          const selector = parseJsonArgument(expression, 'selector') || '';
          const hoverPlan = page.hover?.[selector];
          if (!hoverPlan) {
            replyError(`element not found for selector: ${selector}`);
            return;
          }
          if (hoverPlan.detached) {
            replyError(`element is detached for selector: ${selector}`);
            return;
          }
          if (hoverPlan.hidden || hoverPlan.zeroSized) {
            replyError(`element is hidden or not interactable for selector: ${selector}`);
            return;
          }
          if (hoverPlan.requireCdpMouseMove && !hoverPlan.lastMouseMove) {
            replyError(`real mouse movement required for selector: ${selector}`);
            return;
          }
          if (hoverPlan.error) {
            replyError(hoverPlan.error);
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

        if (expression.includes('new KeyboardEvent(')) {
          const key = parseJsonArgument(expression, 'key') || '';
          const repeat = parseNumberArgument(expression, 'repeat') ?? 1;
          const modifiersMatch = expression.match(/const modifiers = (\[[^\n;]*\]);/);
          const modifiers = modifiersMatch ? (JSON.parse(modifiersMatch[1]) as string[]) : [];
          const keyboardPlan = page.keyboard;
          if (keyboardPlan?.expectedKey && key !== keyboardPlan.expectedKey) {
            replyError(`unexpected key: ${key}`);
            return;
          }
          if (
            keyboardPlan?.expectedModifiers &&
            JSON.stringify(modifiers) !== JSON.stringify(keyboardPlan.expectedModifiers)
          ) {
            replyError(`unexpected modifiers for key: ${key}`);
            return;
          }
          if (
            typeof keyboardPlan?.expectedRepeat === 'number' &&
            repeat !== keyboardPlan.expectedRepeat
          ) {
            replyError(`unexpected repeat for key: ${key}`);
            return;
          }
          reply({
            result: {
              type: 'string',
              value: JSON.stringify({ key, modifiers, repeat }),
            },
          });
          return;
        }

        if (expression.includes('window.scrollBy(deltaX, deltaY)') || expression.includes('element.scrollBy(deltaX, deltaY)')) {
          const selector = parseJsonArgument(expression, 'selector');
          const behavior = parseJsonArgument(expression, 'behavior') || '';
          const deltaX = Number(expression.match(/const deltaX = (-?[0-9]+(?:\.[0-9]+)?);/)?.[1] || 0);
          const deltaY = Number(expression.match(/const deltaY = (-?[0-9]+(?:\.[0-9]+)?);/)?.[1] || 0);
          const scrollPlan = selector ? page.scroll?.[selector] : undefined;
          if (selector && !scrollPlan) {
            replyError(`element not found for selector: ${selector}`);
            return;
          }
          if (scrollPlan?.expectedBehavior && behavior !== scrollPlan.expectedBehavior) {
            replyError(`unexpected scroll behavior for selector: ${selector}`);
            return;
          }
          if (
            typeof scrollPlan?.expectedDeltaX === 'number' &&
            deltaX !== scrollPlan.expectedDeltaX
          ) {
            replyError(`unexpected deltaX for selector: ${selector}`);
            return;
          }
          if (
            typeof scrollPlan?.expectedDeltaY === 'number' &&
            deltaY !== scrollPlan.expectedDeltaY
          ) {
            replyError(`unexpected deltaY for selector: ${selector}`);
            return;
          }
          reply({
            result: {
              type: 'string',
              value: JSON.stringify(
                selector
                  ? { scope: 'element', selector, behavior, deltaX, deltaY }
                  : { scope: 'page', behavior, deltaX, deltaY }
              ),
            },
          });
          return;
        }
      });
    });

    const child = spawn('node', [entryServerPath], {
      cwd: tempDir,
      env: {
        ...process.env,
        ...childEnv,
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

async function runMcpRequests(
  pages: MockPageState[],
  requests: JsonRpcMessage[],
  options: RunMcpRequestsOptions = {}
) {
  const browser = createMockBrowser(pages);
  const child = await browser.start(options);

  try {
    const responsesPromise = collectResponses(
      child,
      requests.length + 1,
      options.responseTimeoutMs
    );
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
    child.stdin.end();

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

    const tools = (
      responses.find((message) => message.id === 2)?.result as {
        tools: Array<{
          name: string;
          description?: string;
          inputSchema?: { properties?: Record<string, { type?: string; minimum?: number }> };
        }>;
      }
    ).tools;

    expect(tools.map((tool) => tool.name)).toEqual([
      'browser_get_session_info',
      'browser_get_url_and_title',
      'browser_get_visible_text',
      'browser_get_dom_snapshot',
      'browser_navigate',
      'browser_click',
      'browser_type',
      'browser_press_key',
      'browser_scroll',
      'browser_take_screenshot',
      'browser_wait_for',
      'browser_eval',
      'browser_hover',
      'browser_query',
      'browser_take_element_screenshot',
      'browser_wait_for_event',
    ]);

    const clickTool = tools.find((tool) => tool.name === 'browser_click');
    expect(clickTool?.description).toContain('mouse event chain');
    expect(clickTool?.description).not.toContain('synthetic element.click()');
    expect(clickTool?.inputSchema?.properties?.offsetX).toMatchObject({ type: 'number' });
    expect(clickTool?.inputSchema?.properties?.offsetY).toMatchObject({ type: 'number' });
    expect(clickTool?.inputSchema?.properties?.button).toMatchObject({ type: 'string' });
    expect(clickTool?.inputSchema?.properties?.clickCount).toMatchObject({
      type: 'integer',
      minimum: 1,
    });

    const keyTool = tools.find((tool) => tool.name === 'browser_press_key');
    expect(keyTool?.inputSchema?.properties?.key).toMatchObject({ type: 'string' });
    expect(keyTool?.inputSchema?.properties?.modifiers).toMatchObject({ type: 'array' });

    const scrollTool = tools.find((tool) => tool.name === 'browser_scroll');
    expect(scrollTool?.inputSchema?.properties?.deltaX).toMatchObject({ type: 'number' });
    expect(scrollTool?.inputSchema?.properties?.deltaY).toMatchObject({ type: 'number' });

    const queryTool = tools.find((tool) => tool.name === 'browser_query');
    expect(queryTool?.inputSchema?.properties?.fields).toMatchObject({
      type: 'array',
    });

    for (const tool of tools.filter((candidate) => candidate.inputSchema?.properties?.pageIndex)) {
      expect(tool.inputSchema?.properties?.pageIndex).toMatchObject({
        type: 'integer',
        minimum: 0,
      });
    }
  });

  it('works from an installed copy when global WebSocket is unavailable and NODE_PATH supplies package dependencies', async () => {
    const installDir = mkdtempSync(join(tmpdir(), 'ccs-browser-installed-copy-'));
    const installedServerPath = join(installDir, 'ccs-browser-server.cjs');
    const bootstrapServerPath = join(installDir, 'bootstrap.cjs');

    try {
      cpSync(bundledServerPath, installedServerPath);
      writeFileSync(
        bootstrapServerPath,
        'delete globalThis.WebSocket;\nrequire("./ccs-browser-server.cjs");\n',
        'utf8'
      );

      const responses = await runMcpRequests(
        [{ id: 'page-1', title: 'Installed Copy', currentUrl: 'https://example.com/' }],
        [
          {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: { name: 'browser_get_url_and_title', arguments: {} },
          },
        ],
        {
          serverPath: bootstrapServerPath,
          childEnv: {
            NODE_PATH: resolveNodeModulesPath(),
          },
          responseTimeoutMs: 12000,
        }
      );

      const response = responses.find((message) => message.id === 2);
      expect((response?.result as { isError?: boolean }).isError).not.toBe(true);
      expect(getResponseText(response)).toContain('title: Installed Copy');
      expect(getResponseText(response)).toContain('url: https://example.com/');
    } finally {
      rmSync(installDir, { recursive: true, force: true });
    }
  }, 10000);

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

  it('returns a handled error when navigation readiness times out', async () => {
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
  }, 8000);

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
          params: {
            name: 'browser_navigate',
            arguments: { pageIndex: 1.5, url: 'https://example.com/next' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {
            name: 'browser_navigate',
            arguments: { pageIndex: 9, url: 'https://example.com/next' },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 2))).toContain(
      'Browser MCP failed: url is required'
    );
    expect(getResponseText(responses.find((message) => message.id === 3))).toContain(
      'Browser MCP failed: url must be an absolute http or https URL'
    );
    expect(getResponseText(responses.find((message) => message.id === 4))).toContain(
      'Browser MCP failed: pageIndex must be a non-negative integer'
    );
    expect(getResponseText(responses.find((message) => message.id === 5))).toContain(
      'page index 9 is out of range'
    );
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

    expect(getResponseText(responses.find((message) => message.id === 2))).toContain(
      'status: clicked'
    );
    expect(getResponseText(responses.find((message) => message.id === 2))).toContain(
      'selector: #submit'
    );

    const selectorMiss = responses.find((message) => message.id === 3);
    expect((selectorMiss?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(selectorMiss)).toContain(
      'element index 0 is out of range for selector: #missing'
    );

    const disabledError = responses.find((message) => message.id === 4);
    expect((disabledError?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(disabledError)).toContain('element is disabled for selector: #disabled');

    const pageSideError = responses.find((message) => message.id === 5);
    expect((pageSideError?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(pageSideError)).toContain('click exploded');
  });

  it('clicks the requested zero-based match and rejects out-of-range nth', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Click Page',
          currentUrl: 'https://example.com/',
          click: {
            '.menu-item': [{ label: 'first' }, { label: 'second' }],
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 20,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '.menu-item', nth: 1 } },
        },
        {
          jsonrpc: '2.0',
          id: 21,
          method: 'tools/call',
          params: { name: 'browser_click', arguments: { selector: '.menu-item', nth: 3 } },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 20))).toContain(
      'status: clicked'
    );
    expect(getResponseText(responses.find((message) => message.id === 20))).toContain('nth: 1');
    expect(getResponseText(responses.find((message) => message.id === 21))).toContain(
      'Browser MCP failed: element index 3 is out of range for selector: .menu-item'
    );
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
    expect(getResponseText(hiddenError)).toContain(
      'element is hidden or not interactable for selector: #hidden'
    );

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

    expect(getResponseText(responses.find((message) => message.id === 2))).toContain(
      'status: clicked'
    );
    expect(getResponseText(responses.find((message) => message.id === 2))).toContain(
      'selector: #menu-trigger'
    );
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

    expect(getResponseText(responses.find((message) => message.id === 2))).toContain(
      'status: clicked'
    );
    expect(getResponseText(responses.find((message) => message.id === 2))).toContain(
      'selector: #click-event'
    );
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

    expect(getResponseText(responses.find((message) => message.id === 2))).toContain(
      'status: clicked'
    );
    expect(getResponseText(responses.find((message) => message.id === 2))).toContain(
      'selector: #fallback'
    );
  });

  it('clicks with element-relative offsets and richer click options', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Click Page',
          currentUrl: 'https://example.com/',
          click: {
            '#offset-target': {
              requireMouseSequence: true,
              expectedOffset: { x: 12, y: 8 },
              expectedButton: 'right',
              expectedClickCount: 2,
            },
            '#double-left': {
              requireMouseSequence: true,
              expectedButton: 'left',
              expectedClickCount: 2,
              requireDoubleClickEvent: true,
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 70,
          method: 'tools/call',
          params: {
            name: 'browser_click',
            arguments: {
              selector: '#offset-target',
              offsetX: 12,
              offsetY: 8,
              button: 'right',
              clickCount: 2,
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 700,
          method: 'tools/call',
          params: {
            name: 'browser_click',
            arguments: {
              selector: '#double-left',
              clickCount: 2,
            },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 70));
    expect(text).toContain('status: clicked');
    expect(text).toContain('offsetX: 12');
    expect(text).toContain('offsetY: 8');
    expect(text).toContain('button: right');
    expect(text).toContain('clickCount: 2');

    const doubleText = getResponseText(responses.find((message) => message.id === 700));
    expect(doubleText).toContain('status: clicked');
    expect(doubleText).toContain('button: left');
    expect(doubleText).toContain('clickCount: 2');
  });

  it('presses a key combination with browser_press_key', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Keyboard Page',
          currentUrl: 'https://example.com/',
          keyboard: {
            expectedKey: 'k',
            expectedModifiers: ['Meta'],
            expectedRepeat: 2,
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 71,
          method: 'tools/call',
          params: {
            name: 'browser_press_key',
            arguments: {
              key: 'k',
              modifiers: ['Meta'],
              repeat: 2,
            },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 71));
    expect(text).toContain('status: key-pressed');
    expect(text).toContain('key: k');
    expect(text).toContain('modifiers: Meta');
    expect(text).toContain('repeat: 2');
  });

  it('supports common special keys with browser_press_key', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Special Key Page',
          currentUrl: 'https://example.com/',
          keyboard: {
            expectedKey: 'Enter',
            expectedRepeat: 1,
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 711,
          method: 'tools/call',
          params: {
            name: 'browser_press_key',
            arguments: {
              key: 'Enter',
            },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 711));
    expect(text).toContain('status: key-pressed');
    expect(text).toContain('key: Enter');
  });

  it('rejects unsupported modifiers for browser_press_key', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Invalid Modifier Page', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 712,
          method: 'tools/call',
          params: {
            name: 'browser_press_key',
            arguments: {
              key: 'k',
              modifiers: ['Cmd'],
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 712);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain(
      'modifiers must only contain: Alt, Control, Meta, Shift'
    );
  });

  it('scrolls an element into view with browser_scroll', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Scroll Page',
          currentUrl: 'https://example.com/',
          scroll: {
            '#results': {
              expectedBehavior: 'into-view',
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 72,
          method: 'tools/call',
          params: {
            name: 'browser_scroll',
            arguments: {
              selector: '#results',
              behavior: 'into-view',
            },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 72));
    expect(text).toContain('status: scrolled');
    expect(text).toContain('selector: #results');
    expect(text).toContain('behavior: into-view');
  });

  it('scrolls an iframe page by offset with browser_scroll', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Iframe Scroll Page',
          currentUrl: 'https://example.com/',
          frames: [
            {
              selector: '#preview-frame',
              query: {
                '#preview-frame': {
                  exists: true,
                },
              },
            },
          ],
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 73,
          method: 'tools/call',
          params: {
            name: 'browser_scroll',
            arguments: {
              frameSelector: '#preview-frame',
              behavior: 'by-offset',
              deltaX: 5,
              deltaY: 40,
            },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 73));
    expect(text).toContain('status: scrolled');
    expect(text).toContain('behavior: by-offset');
    expect(text).toContain('deltaX: 5');
    expect(text).toContain('deltaY: 40');
  });

  it('requires real mouse movement for hover-only targets and reports hover failures', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Hover Page',
          currentUrl: 'https://example.com/',
          hover: {
            '.draft-card': { requireCdpMouseMove: true },
            '.missing-bounds': { zeroSized: true },
          },
          query: {
            '.draft-card': {
              exists: true,
              connected: true,
              rect: {
                x: 100,
                y: 40,
                width: 120,
                height: 48,
                top: 40,
                right: 220,
                bottom: 88,
                left: 100,
              },
              display: 'block',
              visibility: 'visible',
              opacity: '1',
            },
            '.missing-bounds': {
              exists: true,
              connected: true,
              rect: {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
              },
              display: 'block',
              visibility: 'visible',
              opacity: '1',
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
            name: 'browser_hover',
            arguments: { selector: '.draft-card' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'browser_hover',
            arguments: { selector: '.missing-bounds' },
          },
        },
      ]
    );

    const hoverResponse = responses.find((message) => message.id === 2);
    expect((hoverResponse?.result as { isError?: boolean }).isError).not.toBe(true);
    expect(getResponseText(hoverResponse)).toContain('status: hovered');
    expect(getResponseText(hoverResponse)).toContain('selector: .draft-card');

    const hoverError = responses.find((message) => message.id === 3);
    expect((hoverError?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(hoverError)).toContain(
      'element is hidden or not interactable for selector: .missing-bounds'
    );
  });

  it('queries element diagnostics and validates query fields', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Query Page',
          currentUrl: 'https://example.com/',
          query: {
            '.edit-button': {
              exists: true,
              connected: true,
              innerText: 'Edit',
              textContent: 'Edit',
              rect: {
                x: 123,
                y: 45,
                width: 48,
                height: 24,
                top: 45,
                right: 171,
                bottom: 69,
                left: 123,
              },
              display: 'block',
              visibility: 'visible',
              opacity: '1',
            },
            '.missing-button': {
              exists: false,
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
            name: 'browser_query',
            arguments: { selector: '.edit-button' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'browser_query',
            arguments: {
              selector: '.edit-button',
              fields: ['display', 'visibility', 'opacity'],
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'browser_query',
            arguments: { selector: '.missing-button' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {
            name: 'browser_query',
            arguments: { selector: '.edit-button', fields: 'display' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 6,
          method: 'tools/call',
          params: {
            name: 'browser_query',
            arguments: { selector: '.edit-button', fields: ['displayMode'] },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 2))).toContain(
      'exists: true'
    );
    expect(getResponseText(responses.find((message) => message.id === 2))).toContain(
      'boundingClientRect: {"x":123'
    );
    expect(getResponseText(responses.find((message) => message.id === 3))).toContain(
      'display: block'
    );
    expect(getResponseText(responses.find((message) => message.id === 3))).not.toContain(
      'innerText:'
    );

    const missingResponse = responses.find((message) => message.id === 4);
    expect((missingResponse?.result as { isError?: boolean }).isError).not.toBe(true);
    expect(getResponseText(missingResponse)).toContain('exists: false');

    expect(getResponseText(responses.find((message) => message.id === 5))).toContain(
      'Browser MCP failed: fields must be an array of strings'
    );
    expect(getResponseText(responses.find((message) => message.id === 6))).toContain(
      'Browser MCP failed: unknown query field: displayMode'
    );
  });

  it('reports count, nth-aware fields, href, and onclick for multi-match selectors', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Query Page',
          currentUrl: 'https://example.com/',
          query: {
            '.hover-action': [
              {
                exists: true,
                connected: true,
                innerText: 'Open',
                textContent: 'Open',
                display: 'block',
                visibility: 'visible',
                opacity: '1',
                href: 'https://example.com/open',
                onclick: 'openCard()',
              },
              {
                exists: true,
                connected: true,
                innerText: 'Archive',
                textContent: 'Archive',
                display: 'block',
                visibility: 'visible',
                opacity: '0.95',
                href: 'https://example.com/archive',
                onclick: 'archiveCard()',
              },
            ],
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 30,
          method: 'tools/call',
          params: {
            name: 'browser_query',
            arguments: {
              selector: '.hover-action',
              nth: 1,
              fields: ['count', 'exists', 'innerText', 'href', 'onclick'],
            },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 30));
    expect(text).toContain('count: 2');
    expect(text).toContain('exists: true');
    expect(text).toContain('innerText: Archive');
    expect(text).toContain('href: https://example.com/archive');
    expect(text).toContain('onclick: archiveCard()');
    expect(text).toContain('nth: 1');
  });

  it('keeps count and exists available when nth is out of range, but rejects target fields', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Query Page',
          currentUrl: 'https://example.com/',
          query: {
            '.hover-action': [
              {
                exists: true,
                connected: true,
                innerText: 'Open',
                textContent: 'Open',
                display: 'block',
                visibility: 'visible',
                opacity: '1',
              },
            ],
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 31,
          method: 'tools/call',
          params: {
            name: 'browser_query',
            arguments: {
              selector: '.hover-action',
              nth: 3,
              fields: ['count', 'exists'],
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 32,
          method: 'tools/call',
          params: {
            name: 'browser_query',
            arguments: {
              selector: '.hover-action',
              nth: 3,
              fields: ['count', 'innerText'],
            },
          },
        },
      ]
    );

    const countOnly = responses.find((message) => message.id === 31);
    expect((countOnly?.result as { isError?: boolean }).isError).not.toBe(true);
    expect(getResponseText(countOnly)).toContain('count: 1');
    expect(getResponseText(countOnly)).toContain('exists: false');

    expect(getResponseText(responses.find((message) => message.id === 32))).toContain(
      'Browser MCP failed: element index 3 is out of range for selector: .hover-action'
    );
  });

  it('waits for selector visibility with opacity threshold', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Wait Page',
          currentUrl: 'https://example.com/',
          wait: {
            selectorSnapshots: {
              '.hover-action': [
                { exists: false },
                {
                  exists: true,
                  connected: true,
                  display: 'block',
                  visibility: 'visible',
                  opacity: '0.95',
                  rect: {
                    x: 10,
                    y: 10,
                    width: 40,
                    height: 20,
                    top: 10,
                    right: 50,
                    bottom: 30,
                    left: 10,
                  },
                },
              ],
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 40,
          method: 'tools/call',
          params: {
            name: 'browser_wait_for',
            arguments: {
              selector: '.hover-action',
              timeoutMs: 1000,
              pollIntervalMs: 10,
              condition: { kind: 'visibility', visibility: 'visible', opacityGt: 0.9 },
            },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 40))).toContain(
      'status: satisfied'
    );
  });

  it('waits for page text includes and returns timeout summaries', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Wait Timeout',
          currentUrl: 'https://example.com/',
          wait: {
            pageTextSequence: ['loading', 'loading', 'loaded archive menu'],
            selectorSnapshots: {
              '.hover-action': [
                {
                  exists: true,
                  connected: true,
                  display: 'block',
                  visibility: 'visible',
                  opacity: '0.2',
                  rect: {
                    x: 10,
                    y: 10,
                    width: 40,
                    height: 20,
                    top: 10,
                    right: 50,
                    bottom: 30,
                    left: 10,
                  },
                },
              ],
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 41,
          method: 'tools/call',
          params: {
            name: 'browser_wait_for',
            arguments: {
              timeoutMs: 1000,
              pollIntervalMs: 10,
              condition: { kind: 'text', includes: 'archive menu' },
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 42,
          method: 'tools/call',
          params: {
            name: 'browser_wait_for',
            arguments: {
              selector: '.hover-action',
              timeoutMs: 30,
              pollIntervalMs: 10,
              condition: { kind: 'visibility', visibility: 'visible', opacityGt: 0.9 },
            },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 41))).toContain(
      'status: satisfied'
    );
    expect(getResponseText(responses.find((message) => message.id === 42))).toContain(
      'Browser MCP failed: wait condition timed out'
    );
    expect(getResponseText(responses.find((message) => message.id === 42))).toContain(
      'opacity=0.2'
    );
  });

  it('waits for selector text includes', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Wait Text',
          currentUrl: 'https://example.com/',
          wait: {
            selectorSnapshots: {
              '.hover-action': [
                [
                  {
                    exists: true,
                    connected: true,
                    innerText: 'Open',
                    textContent: 'Open',
                    display: 'block',
                    visibility: 'visible',
                    opacity: '1',
                  },
                ],
                [
                  {
                    exists: true,
                    connected: true,
                    innerText: 'Archive',
                    textContent: 'Archive',
                    display: 'block',
                    visibility: 'visible',
                    opacity: '1',
                  },
                ],
              ],
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 45,
          method: 'tools/call',
          params: {
            name: 'browser_wait_for',
            arguments: {
              selector: '.hover-action',
              timeoutMs: 1000,
              pollIntervalMs: 10,
              condition: { kind: 'text', includes: 'Archive' },
            },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 45))).toContain(
      'status: satisfied'
    );
  });

  it('lets nth become valid later during polling and rejects unsupported page-level wait kinds', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Wait Nth',
          currentUrl: 'https://example.com/',
          wait: {
            selectorSnapshots: {
              '.hover-action': [
                [
                  {
                    exists: true,
                    connected: true,
                    innerText: 'Open',
                    textContent: 'Open',
                    display: 'block',
                    visibility: 'visible',
                    opacity: '1',
                  },
                ],
                [
                  {
                    exists: true,
                    connected: true,
                    innerText: 'Open',
                    textContent: 'Open',
                    display: 'block',
                    visibility: 'visible',
                    opacity: '1',
                  },
                  {
                    exists: true,
                    connected: true,
                    innerText: 'Archive',
                    textContent: 'Archive',
                    display: 'block',
                    visibility: 'visible',
                    opacity: '1',
                    rect: {
                      x: 10,
                      y: 10,
                      width: 40,
                      height: 20,
                      top: 10,
                      right: 50,
                      bottom: 30,
                      left: 10,
                    },
                  },
                ],
              ],
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 43,
          method: 'tools/call',
          params: {
            name: 'browser_wait_for',
            arguments: {
              selector: '.hover-action',
              nth: 1,
              timeoutMs: 1000,
              pollIntervalMs: 10,
              condition: { kind: 'visibility', visibility: 'visible' },
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 44,
          method: 'tools/call',
          params: {
            name: 'browser_wait_for',
            arguments: {
              timeoutMs: 100,
              pollIntervalMs: 10,
              condition: { kind: 'visibility', visibility: 'visible' },
            },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 43))).toContain(
      'status: satisfied'
    );
    expect(getResponseText(responses.find((message) => message.id === 44))).toContain(
      'Browser MCP failed: page-level wait only supports text conditions in Phase 1'
    );
  });

  it('defaults browser_eval to readonly and enforces readwrite gating', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Eval Page',
          currentUrl: 'https://example.com/',
          eval: {
            'JSON.stringify({ hovered: true, label: "Archive" })': {
              result: { hovered: true, label: 'Archive' },
            },
            'document.body.dataset.test = "1"': {
              error: 'EvalError: Possible side-effect in debug-evaluate',
            },
            'throw new Error("boom")': {
              error: 'boom',
            },
            window: {
              nonSerializable: true,
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 50,
          method: 'tools/call',
          params: {
            name: 'browser_eval',
            arguments: { expression: 'JSON.stringify({ hovered: true, label: "Archive" })' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 51,
          method: 'tools/call',
          params: {
            name: 'browser_eval',
            arguments: { expression: 'document.body.dataset.test = "1"' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 52,
          method: 'tools/call',
          params: {
            name: 'browser_eval',
            arguments: { expression: 'document.body.dataset.test = "1"', mode: 'readwrite' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 53,
          method: 'tools/call',
          params: {
            name: 'browser_eval',
            arguments: { expression: 'throw new Error("boom")' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 54,
          method: 'tools/call',
          params: {
            name: 'browser_eval',
            arguments: { expression: 'window' },
          },
        },
      ],
      { childEnv: { ...process.env, CCS_BROWSER_EVAL_MODE: 'readonly' } }
    );

    expect(getResponseText(responses.find((message) => message.id === 50))).toContain(
      'mode: readonly'
    );
    expect(getResponseText(responses.find((message) => message.id === 50))).toContain(
      'value: {"hovered":true,"label":"Archive"}'
    );
    expect(getResponseText(responses.find((message) => message.id === 51))).toContain(
      'Browser MCP failed: EvalError: Possible side-effect in debug-evaluate'
    );
    expect(getResponseText(responses.find((message) => message.id === 52))).toContain(
      'Browser MCP failed: browser_eval readwrite mode is disabled by CCS_BROWSER_EVAL_MODE=readonly'
    );
    expect(getResponseText(responses.find((message) => message.id === 53))).toContain(
      'Browser MCP failed: boom'
    );
    expect(getResponseText(responses.find((message) => message.id === 54))).toContain(
      'Browser MCP failed: evaluation result is not JSON-serializable'
    );
  });

  it('allows readwrite browser_eval when configured', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Eval Page',
          currentUrl: 'https://example.com/',
          eval: {
            'document.body.dataset.test = "1"': {
              result: 'ok',
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 54,
          method: 'tools/call',
          params: {
            name: 'browser_eval',
            arguments: { expression: 'document.body.dataset.test = "1"', mode: 'readwrite' },
          },
        },
      ],
      { childEnv: { ...process.env, CCS_BROWSER_EVAL_MODE: 'readwrite' } }
    );

    expect(getResponseText(responses.find((message) => message.id === 54))).toContain(
      'mode: readwrite'
    );
    expect(getResponseText(responses.find((message) => message.id === 54))).toContain(
      'value: "ok"'
    );
  });

  it('queries inside an iframe selected by frameSelector', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Frame Page',
          currentUrl: 'https://example.com/',
          frames: [
            {
              selector: '#details-frame',
              query: {
                '.save-button': {
                  exists: true,
                  connected: true,
                  innerText: 'Save',
                  textContent: 'Save',
                  display: 'block',
                  visibility: 'visible',
                  opacity: '1',
                },
              },
            },
          ],
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 55,
          method: 'tools/call',
          params: {
            name: 'browser_query',
            arguments: {
              selector: '.save-button',
              frameSelector: '#details-frame',
              fields: ['exists', 'innerText'],
            },
          },
        },
      ]
    );

    expect(
      getMockFrame(
        {
          frames: [{ selector: '#details-frame' }],
          id: 'x',
          title: 'x',
          currentUrl: 'https://example.com/',
        },
        '#details-frame'
      )
    ).toBeDefined();
    expect(getResponseText(responses.find((message) => message.id === 55))).toContain(
      'innerText: Save'
    );
  });

  it('queries through open shadow roots when pierceShadow is true', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Shadow Page',
          currentUrl: 'https://example.com/',
          shadowRoots: [
            {
              hostSelector: 'app-toolbar',
              query: {
                'button[action="archive"]': {
                  exists: true,
                  connected: true,
                  innerText: 'Archive',
                  textContent: 'Archive',
                  display: 'block',
                  visibility: 'visible',
                  opacity: '1',
                },
              },
            },
          ],
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 56,
          method: 'tools/call',
          params: {
            name: 'browser_query',
            arguments: {
              selector: 'button[action="archive"]',
              pierceShadow: true,
              fields: ['exists', 'innerText'],
            },
          },
        },
      ]
    );

    expect(
      getMockShadowRoot({
        shadowRoots: [{ hostSelector: 'app-toolbar' }],
        id: 'x',
        title: 'x',
        currentUrl: 'https://example.com/',
      })
    ).toBeDefined();
    expect(getResponseText(responses.find((message) => message.id === 56))).toContain(
      'innerText: Archive'
    );
  });

  it('waits for a matching navigation event with browser_wait_for_event', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Event Page',
          currentUrl: 'https://example.com/',
          events: {
            navigations: [{ url: 'https://example.com/checkout' }],
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 57,
          method: 'tools/call',
          params: {
            name: 'browser_wait_for_event',
            arguments: {
              timeoutMs: 1000,
              event: { kind: 'navigation', urlIncludes: '/checkout' },
            },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 57))).toContain(
      'status: observed'
    );
  });

  it('ignores child-frame navigations when waiting for a page navigation event', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Event Page',
          currentUrl: 'https://example.com/',
          events: {
            navigations: [
              { url: 'https://example.com/embedded-checkout', parentId: 'frame-1' },
              { url: 'https://example.com/checkout' },
            ],
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 58,
          method: 'tools/call',
          params: {
            name: 'browser_wait_for_event',
            arguments: {
              timeoutMs: 1000,
              event: { kind: 'navigation', urlIncludes: '/checkout' },
            },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 58));
    expect(text).toContain('status: observed');
    expect(text).toContain('"url":"https://example.com/checkout"');
    expect(text).not.toContain('embedded-checkout');
  });

  it('captures element screenshots using the post-scroll visible clip and reports failures', async () => {
    const screenshotPlan: MockPageState['screenshot'] = {
      data: 'ZWxlbWVudC1zaG90',
      requireScrolledMeasurement: true,
      expectedClip: {
        x: 0,
        y: 12,
        width: 50,
        height: 28,
        scale: 1,
      },
    };
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Element Screenshot Page',
          currentUrl: 'https://example.com/',
          query: {
            '.edit-button': {
              exists: true,
              connected: true,
              innerText: 'Edit',
              textContent: 'Edit',
              rect: {
                x: -14,
                y: 12,
                width: 64,
                height: 28,
                top: 12,
                right: 50,
                bottom: 40,
                left: -14,
              },
              display: 'block',
              visibility: 'visible',
              opacity: '1',
            },
            '.zero-sized': {
              exists: true,
              connected: true,
              rect: {
                x: 10,
                y: 10,
                width: 0,
                height: 0,
                top: 10,
                right: 10,
                bottom: 10,
                left: 10,
              },
              display: 'block',
              visibility: 'visible',
              opacity: '1',
            },
          },
          screenshot: screenshotPlan,
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'browser_take_element_screenshot',
            arguments: { selector: '.edit-button' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'browser_take_element_screenshot',
            arguments: { selector: '.missing-button' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'browser_take_element_screenshot',
            arguments: { selector: '.zero-sized' },
          },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 2));
    expect(text).toContain('selector: .edit-button');
    expect(text).toContain('format: png');
    expect(text).toContain('data: ZWxlbWVudC1zaG90');

    expect(getResponseText(responses.find((message) => message.id === 3))).toContain(
      'Browser MCP failed: element not found for selector: .missing-button'
    );
    expect(getResponseText(responses.find((message) => message.id === 4))).toContain(
      'Browser MCP failed: element has empty bounds for selector: .zero-sized'
    );

    const emptyPayloadResponses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Element Screenshot Empty Payload Page',
          currentUrl: 'https://example.com/',
          query: {
            '.edit-button': {
              exists: true,
              connected: true,
              rect: {
                x: 220,
                y: 80,
                width: 64,
                height: 28,
                top: 80,
                right: 284,
                bottom: 108,
                left: 220,
              },
              display: 'block',
              visibility: 'visible',
              opacity: '1',
            },
          },
          screenshot: { data: '' },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'browser_take_element_screenshot',
            arguments: { selector: '.edit-button' },
          },
        },
      ]
    );

    expect(getResponseText(emptyPayloadResponses.find((message) => message.id === 2))).toContain(
      'Browser MCP failed: screenshot capture failed'
    );

    const iframeScreenshotResponses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Iframe Screenshot Page',
          currentUrl: 'https://example.com/',
          frames: [
            {
              selector: '#details-frame',
              query: {
                '#details-frame': {
                  exists: true,
                  connected: true,
                  rect: {
                    x: 40,
                    y: 100,
                    width: 300,
                    height: 200,
                    top: 100,
                    right: 340,
                    bottom: 300,
                    left: 40,
                  },
                  display: 'block',
                  visibility: 'visible',
                  opacity: '1',
                },
                '.save-button': {
                  exists: true,
                  connected: true,
                  rect: {
                    x: 10,
                    y: 20,
                    width: 60,
                    height: 24,
                    top: 20,
                    right: 70,
                    bottom: 44,
                    left: 10,
                  },
                  display: 'block',
                  visibility: 'visible',
                  opacity: '1',
                },
              },
            },
          ],
          screenshot: {
            data: 'aWZyYW1lLXNob3Q=',
            requireScrolledMeasurement: true,
            expectedClip: {
              x: 50,
              y: 120,
              width: 60,
              height: 24,
              scale: 1,
            },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {
            name: 'browser_take_element_screenshot',
            arguments: { selector: '.save-button', frameSelector: '#details-frame' },
          },
        },
      ]
    );

    expect(
      getResponseText(iframeScreenshotResponses.find((message) => message.id === 5))
    ).toContain('data: aWZyYW1lLXNob3Q=');
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
    expect(getResponseText(errorResponse)).toContain(
      'Browser MCP failed: screenshot capture failed'
    );
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
    expect(getResponseText(unsupported)).toContain(
      'element is not text-editable for selector: #color'
    );

    const nonEditable = responses.find((message) => message.id === 6);
    expect((nonEditable?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(nonEditable)).toContain(
      'element is not text-editable for selector: #plain'
    );
  });
});
