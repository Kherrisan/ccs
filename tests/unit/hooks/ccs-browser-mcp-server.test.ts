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

type MockDownloadProgressState = {
  receivedBytes: number;
  totalBytes: number;
  state: 'inProgress' | 'completed' | 'canceled';
  filePath?: string;
};

type MockDownloadState = {
  guid?: string;
  url: string;
  suggestedFilename: string;
  progress?: MockDownloadProgressState[];
};

type MockBrowserState = {
  setDownloadBehaviorCalls?: Array<{
    behavior: string;
    downloadPath?: string;
    eventsEnabled?: boolean;
  }>;
  canceledDownloadGuids?: string[];
};

type MockPageEventPlan = {
  dialogs?: Array<{ type: string; message: string }>;
  navigations?: Array<{ url: string; parentId?: string }>;
  requests?: Array<{ url: string; method: string }>;
  downloads?: MockDownloadState[];
};

type MockFileInputState = {
  kind: 'file' | 'nonfile';
  multiple?: boolean;
  assignedFiles?: string[];
};

type MockFileInputPlan = MockFileInputState | MockFileInputState[];

type MockDropzoneState = {
  accepted?: boolean;
  requireFiles?: boolean;
  receivedEventTypes?: string[];
  receivedFiles?: Array<{ name: string; size: number; type: string }>;
  error?: string;
};

type MockDropzonePlan = MockDropzoneState | MockDropzoneState[];

type MockPointerActionRecord = {
  type: string;
  x?: number;
  y?: number;
  button?: string;
};

type MockDragPlan = {
  recordedActions?: MockPointerActionRecord[];
};

type MockFrameState = {
  selector: string;
  query?: Record<string, MockQueryPlan>;
  visibleText?: string;
  fileInputs?: Record<string, MockFileInputPlan>;
  dropzones?: Record<string, MockDropzonePlan>;
};

type MockShadowRootState = {
  hostSelector: string;
  query?: Record<string, MockQueryPlan>;
  fileInputs?: Record<string, MockFileInputPlan>;
  dropzones?: Record<string, MockDropzonePlan>;
};

type MockEvalPlan = Record<
  string,
  {
    result?: unknown;
    error?: string;
    nonSerializable?: boolean;
  }
>;

type MockInterceptRuleMatch = {
  url: string;
  method: string;
  resourceType?: string;
  requestId?: string;
  requestHeaders?: Record<string, string>;
};

type MockFulfilledRequest = {
  requestId: string;
  responseCode?: number;
  responseHeaders?: Array<{ name: string; value: string }>;
  body?: string;
};

type MockInterceptState = {
  pausedRequests?: MockInterceptRuleMatch[];
  continuedRequestIds?: string[];
  failedRequests?: Array<{ requestId: string; errorReason?: string }>;
  fulfilledRequests?: MockFulfilledRequest[];
  fetchEnabledPatterns?: unknown[];
  enableError?: string;
  pauseDispatchDelayMs?: number;
};

type MockPageState = {
  id: string;
  title: string;
  currentUrl: string;
  fileInputs?: Record<string, MockFileInputPlan>;
  browser?: MockBrowserState;
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
  dropzones?: Record<string, MockDropzonePlan>;
  drag?: MockDragPlan;
  events?: MockPageEventPlan;
  intercept?: MockInterceptState;
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

function parseParsedJsonArrayArgument<T>(expression: string, key: string): T[] {
  const marker = `const ${key} = JSON.parse(`;
  const start = expression.indexOf(marker);
  if (start === -1) {
    return [];
  }

  const quoteStart = start + marker.length;
  const quote = expression[quoteStart];
  if (quote !== '"' && quote !== "'") {
    return [];
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
      return JSON.parse(decoded) as T[];
    }
    index += 1;
  }

  return [];
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

function getMockDropzoneState(
  page: Pick<MockPageState, 'dropzones' | 'frames' | 'shadowRoots'>,
  selector: string,
  options: { nth?: number; frameSelector?: string; pierceShadow?: boolean } = {}
): MockDropzoneState | null {
  const nth = options.nth ?? 0;
  if (options.frameSelector) {
    const frame = page.frames?.find((entry) => entry.selector === options.frameSelector);
    const plan = frame?.dropzones?.[selector];
    if (!plan) {
      return null;
    }
    return Array.isArray(plan) ? (plan[nth] ?? null) : plan;
  }
  if (options.pierceShadow) {
    for (const shadowRoot of page.shadowRoots || []) {
      const plan = shadowRoot.dropzones?.[selector];
      if (plan) {
        return Array.isArray(plan) ? (plan[nth] ?? null) : plan;
      }
    }
  }
  const plan = page.dropzones?.[selector];
  if (!plan) {
    return null;
  }
  return Array.isArray(plan) ? (plan[nth] ?? null) : plan;
}

function pushPointerAction(page: MockPageState, action: MockPointerActionRecord): void {
  page.drag = page.drag || {};
  page.drag.recordedActions = page.drag.recordedActions || [];
  page.drag.recordedActions.push(action);
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
  let nextPageCounter = pagesInput.length + 1;

  for (const [index, page] of pagesInput.entries()) {
    if (page.visibleText === undefined) {
      page.visibleText = 'Hello from visible text';
    }
    if (page.domSnapshot === undefined) {
      page.domSnapshot = '<html><body>Hello from DOM snapshot</body></html>';
    }
    pageStates.set(`/devtools/page/${index + 1}`, page);
  }

  async function start(options: RunMcpRequestsOptions = {}) {
    const entryServerPath = options.serverPath || bundledServerPath;
    const childEnv = options.childEnv || {};
    tempDir = mkdtempSync(join(tmpdir(), 'ccs-browser-mcp-server-'));

    const port = await new Promise<number>((resolve, reject) => {
      httpServer = http.createServer((req, res) => {
        const address = httpServer?.address();
        const serverPort = address && typeof address !== 'string' ? address.port : 0;

        if (req.url === '/json/list') {
          const pageEntries = Array.from(pageStates.entries());
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify([
              ...pageEntries.map(([wsPath, page]) => ({
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

        if (req.url?.startsWith('/json/new')) {
          const parsed = new URL(req.url, `http://127.0.0.1:${serverPort}`);
          const requestedUrl = parsed.searchParams.get('url') || 'about:blank';
          const wsPath = `/devtools/page/${nextPageCounter}`;
          const newPage: MockPageState = {
            id: `page-${nextPageCounter}`,
            title: requestedUrl === 'about:blank' ? 'about:blank' : requestedUrl,
            currentUrl: requestedUrl,
            visibleText: 'New page visible text',
            domSnapshot: '<html><body>New page</body></html>',
          };
          pageStates.set(wsPath, newPage);
          nextPageCounter += 1;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              id: newPage.id,
              type: 'page',
              title: newPage.title,
              url: newPage.currentUrl,
              webSocketDebuggerUrl: `ws://127.0.0.1:${serverPort}${wsPath}`,
            })
          );
          return;
        }

        if (req.url?.startsWith('/json/close/')) {
          const targetId = decodeURIComponent(req.url.slice('/json/close/'.length));
          const entry = Array.from(pageStates.entries()).find(([, page]) => page.id === targetId);
          if (!entry) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'page not found' }));
            return;
          }
          pageStates.delete(entry[0]);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: targetId }));
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
        const browserState = pagesInput[0]?.browser || (pagesInput[0] ? (pagesInput[0].browser = {}) : {});

        socket.on('message', (raw) => {
          const message = JSON.parse(raw.toString()) as {
            id: number;
            method: string;
            params?: Record<string, unknown>;
          };

          function reply(result: unknown): void {
            socket.send(JSON.stringify({ id: message.id, result }));
          }

          if (message.method === 'Browser.setDownloadBehavior') {
            browserState.setDownloadBehaviorCalls = browserState.setDownloadBehaviorCalls || [];
            browserState.setDownloadBehaviorCalls.push({
              behavior: typeof message.params?.behavior === 'string' ? message.params.behavior : '',
              downloadPath:
                typeof message.params?.downloadPath === 'string' ? message.params.downloadPath : undefined,
              eventsEnabled:
                typeof message.params?.eventsEnabled === 'boolean' ? message.params.eventsEnabled : undefined,
            });
            reply({});
            return;
          }

          if (message.method === 'Browser.cancelDownload') {
            browserState.canceledDownloadGuids = browserState.canceledDownloadGuids || [];
            browserState.canceledDownloadGuids.push(String(message.params?.guid || ''));
            reply({});
          }
        });

        for (const page of pagesInput) {
          for (const [index, download] of (page.events?.downloads || []).entries()) {
            const guid = download.guid || `${page.id}-download-${index + 1}`;
            setTimeout(() => {
              socket.send(
                JSON.stringify({
                  method: 'Browser.downloadWillBegin',
                  params: {
                    frameId: `frame-${page.id}`,
                    guid,
                    url: download.url,
                    suggestedFilename: download.suggestedFilename,
                  },
                })
              );
            }, 10 + index * 40);

            for (const [progressIndex, progress] of (download.progress || []).entries()) {
              setTimeout(() => {
                socket.send(
                  JSON.stringify({
                    method: 'Browser.downloadProgress',
                    params: {
                      guid,
                      totalBytes: progress.totalBytes,
                      receivedBytes: progress.receivedBytes,
                      state: progress.state,
                      filePath: progress.filePath,
                    },
                  })
                );
              }, 20 + index * 40 + progressIndex * 20);
            }
          }
        }
        return;
      }

      const page = pageStates.get(request.url || '');
      if (!page) {
        socket.close();
        return;
      }

      const remoteObjects = new Map<string, MockFileInputState>();

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
          const button = typeof message.params?.button === 'string' ? message.params.button : undefined;
          for (const hoverPlan of Object.values(page.hover || {})) {
            if (type === 'mouseMoved') {
              hoverPlan.lastMouseMove = { x, y };
            }
          }
          pushPointerAction(page, { type, x, y, button });
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

        if (message.method === 'Fetch.enable') {
          page.intercept = page.intercept || {};
          page.intercept.fetchEnabledPatterns = Array.isArray(message.params?.patterns)
            ? (message.params?.patterns as unknown[])
            : [];
          if (page.intercept.enableError) {
            socket.send(JSON.stringify({ id: message.id, error: { message: page.intercept.enableError } }));
            return;
          }
          reply({});
          const pauseDispatchDelayMs = page.intercept.pauseDispatchDelayMs ?? 10;
          for (const [index, paused] of (page.intercept.pausedRequests || []).entries()) {
            setTimeout(() => {
              socket.send(
                JSON.stringify({
                  method: 'Fetch.requestPaused',
                  params: {
                    requestId: paused.requestId || `fetch-${index + 1}`,
                    resourceType: paused.resourceType || 'XHR',
                    request: {
                      url: paused.url,
                      method: paused.method,
                      headers: paused.requestHeaders || {},
                    },
                  },
                })
              );
            }, pauseDispatchDelayMs + index * 10);
          }
          return;
        }

        if (message.method === 'Fetch.continueRequest') {
          page.intercept = page.intercept || {};
          page.intercept.continuedRequestIds = page.intercept.continuedRequestIds || [];
          page.intercept.continuedRequestIds.push(String(message.params?.requestId || ''));
          reply({});
          return;
        }

        if (message.method === 'Fetch.failRequest') {
          page.intercept = page.intercept || {};
          page.intercept.failedRequests = page.intercept.failedRequests || [];
          page.intercept.failedRequests.push({
            requestId: String(message.params?.requestId || ''),
            errorReason: typeof message.params?.errorReason === 'string' ? message.params.errorReason : '',
          });
          reply({});
          return;
        }

        if (message.method === 'Fetch.fulfillRequest') {
          page.intercept = page.intercept || {};
          page.intercept.fulfilledRequests = page.intercept.fulfilledRequests || [];
          page.intercept.fulfilledRequests.push({
            requestId: String(message.params?.requestId || ''),
            responseCode:
              typeof message.params?.responseCode === 'number' ? message.params.responseCode : undefined,
            responseHeaders: Array.isArray(message.params?.responseHeaders)
              ? (message.params.responseHeaders as Array<{ name: string; value: string }>)
              : [],
            body: typeof message.params?.body === 'string' ? message.params.body : '',
          });
          reply({});
          return;
        }

        if (message.method === 'DOM.setFileInputFiles') {
          const objectId = typeof message.params?.objectId === 'string' ? message.params.objectId : '';
          const target = remoteObjects.get(objectId);
          if (!target) {
            socket.send(JSON.stringify({ id: message.id, error: { message: 'file input handle not found' } }));
            return;
          }
          target.assignedFiles = Array.isArray(message.params?.files)
            ? (message.params.files as unknown[]).map((entry) => String(entry))
            : [];
          reply({});
          return;
        }

        if (message.method !== 'Runtime.evaluate') {
          return;
        }

        const expression = String(message.params?.expression || '');

        if (expression.includes('new DragEvent') && expression.includes('new DataTransfer()')) {
          const selector = parseJsonArgument(expression, 'selector') || '';
          const nth = parseNumberArgument(expression, 'nth') ?? 0;
          const frameSelector = parseJsonArgument(expression, 'frameSelector') || '';
          const pierceShadow = expression.includes('const pierceShadow = true');
          const filePayloads = parseParsedJsonArrayArgument<{
            name: string;
            size: number;
            mimeType: string;
          }>(expression, 'filePayloads');
          const eventTypes = Array.from(
            expression.matchAll(/new DragEvent\('(dragenter|dragover|drop)'/g)
          ).map((match) => match[1]);

          const target = getMockDropzoneState(page, selector, {
            nth,
            frameSelector,
            pierceShadow,
          });
          if (!target) {
            replyError(`element not found for selector: ${selector}`);
            return;
          }
          if (target.error) {
            replyError(target.error);
            return;
          }
          if (eventTypes.length === 0) {
            replyError(`drag event sequence not found for selector: ${selector}`);
            return;
          }
          if (target.requireFiles && filePayloads.length === 0) {
            reply({ result: { type: 'object', value: { accepted: false } } });
            return;
          }
          target.receivedEventTypes = eventTypes;
          target.receivedFiles = filePayloads.map((file) => ({
            name: file.name,
            size: file.size,
            type: file.mimeType,
          }));
          reply({ result: { type: 'object', value: { accepted: target.accepted !== false } } });
          return;
        }

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

        if (expression === '0') {
          reply({ result: { type: 'number', value: 0 } });
          return;
        }

        if (expression.includes('element is not a file input for selector:')) {
          const selector = parseJsonArgument(expression, 'selector') || '';
          const nth = parseNumberArgument(expression, 'nth') ?? 0;
          const frameSelector = parseJsonArgument(expression, 'frameSelector') || '';
          const pierceShadow = expression.includes('const pierceShadow = true');

          const fileInputPlan = frameSelector
            ? getMockFrame(page, frameSelector)?.fileInputs?.[selector]
            : pierceShadow
              ? getMockShadowRoot(page)?.fileInputs?.[selector]
              : page.fileInputs?.[selector];

          const { count, target } = pickMockMatch(fileInputPlan, nth);
          if (!target || count <= nth) {
            replyError(`element not found for selector: ${selector}`);
            return;
          }
          if (target.kind !== 'file') {
            replyError(`element is not a file input for selector: ${selector}`);
            return;
          }

          const objectId = `file-input:${page.id}:${selector}:${nth}:${frameSelector || 'root'}:${pierceShadow ? 'shadow' : 'light'}`;
          remoteObjects.set(objectId, target);
          socket.send(
            JSON.stringify({
              id: message.id,
              result: {
                result: {
                  type: 'object',
                  subtype: 'node',
                  className: 'HTMLInputElement',
                  objectId,
                },
              },
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
      'browser_select_page',
      'browser_open_page',
      'browser_close_page',
      'browser_add_intercept_rule',
      'browser_remove_intercept_rule',
      'browser_list_intercept_rules',
      'browser_list_requests',
      'browser_set_download_behavior',
      'browser_list_downloads',
      'browser_cancel_download',
      'browser_set_file_input',
      'browser_drag_files',
      'browser_drag_element',
      'browser_pointer_action',
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

    const selectTool = tools.find((tool) => tool.name === 'browser_select_page');
    expect(selectTool?.inputSchema?.properties?.pageIndex).toMatchObject({ type: 'integer' });
    expect(selectTool?.inputSchema?.properties?.pageId).toMatchObject({ type: 'string' });

    const openTool = tools.find((tool) => tool.name === 'browser_open_page');
    expect(openTool?.inputSchema?.properties?.url).toMatchObject({ type: 'string' });

    const closeTool = tools.find((tool) => tool.name === 'browser_close_page');
    expect(closeTool?.inputSchema?.properties?.pageIndex).toMatchObject({ type: 'integer' });
    expect(closeTool?.inputSchema?.properties?.pageId).toMatchObject({ type: 'string' });

    const addRuleTool = tools.find((tool) => tool.name === 'browser_add_intercept_rule');
    expect(addRuleTool?.inputSchema?.properties?.pageIndex).toMatchObject({ type: 'integer' });
    expect(addRuleTool?.inputSchema?.properties?.pageId).toMatchObject({ type: 'string' });
    expect(addRuleTool?.inputSchema?.properties?.urlIncludes).toMatchObject({ type: 'string' });
    expect(addRuleTool?.inputSchema?.properties?.method).toMatchObject({ type: 'string' });
    expect(addRuleTool?.inputSchema?.properties?.resourceType).toMatchObject({ type: 'string' });
    expect(addRuleTool?.inputSchema?.properties?.urlPattern).toMatchObject({ type: 'string' });
    expect(addRuleTool?.inputSchema?.properties?.urlRegex).toMatchObject({ type: 'string' });
    expect(addRuleTool?.inputSchema?.properties?.headerMatchers).toMatchObject({ type: 'array' });
    expect(addRuleTool?.inputSchema?.properties?.priority).toMatchObject({ type: 'integer' });
    expect(addRuleTool?.inputSchema?.properties?.action).toMatchObject({ type: 'string' });
    expect(addRuleTool?.inputSchema?.properties?.statusCode).toMatchObject({ type: 'integer' });
    expect(addRuleTool?.inputSchema?.properties?.responseHeaders).toMatchObject({ type: 'array' });
    expect(addRuleTool?.inputSchema?.properties?.headers).toBeUndefined();
    expect(addRuleTool?.inputSchema?.properties?.body).toMatchObject({ type: 'string' });
    expect(addRuleTool?.inputSchema?.properties?.contentType).toMatchObject({ type: 'string' });

    const removeRuleTool = tools.find((tool) => tool.name === 'browser_remove_intercept_rule');
    expect(removeRuleTool?.inputSchema?.properties?.ruleId).toMatchObject({ type: 'string' });

    const listRulesTool = tools.find((tool) => tool.name === 'browser_list_intercept_rules');
    expect(listRulesTool?.inputSchema).toMatchObject({ type: 'object' });

    const listRequestsTool = tools.find((tool) => tool.name === 'browser_list_requests');
    expect(listRequestsTool?.inputSchema?.properties?.pageIndex).toMatchObject({ type: 'integer' });
    expect(listRequestsTool?.inputSchema?.properties?.pageId).toMatchObject({ type: 'string' });
    expect(listRequestsTool?.inputSchema?.properties?.limit).toMatchObject({ type: 'integer' });

    const setDownloadTool = tools.find((tool) => tool.name === 'browser_set_download_behavior');
    expect(setDownloadTool?.inputSchema?.properties?.behavior).toMatchObject({ type: 'string' });
    expect(setDownloadTool?.inputSchema?.properties?.downloadPath).toMatchObject({ type: 'string' });
    expect(setDownloadTool?.inputSchema?.properties?.eventsEnabled).toMatchObject({ type: 'boolean' });

    const listDownloadsTool = tools.find((tool) => tool.name === 'browser_list_downloads');
    expect(listDownloadsTool?.inputSchema?.properties?.limit).toMatchObject({ type: 'integer' });
    expect(listDownloadsTool?.inputSchema?.properties?.pageId).toBeUndefined();

    const cancelDownloadTool = tools.find((tool) => tool.name === 'browser_cancel_download');
    expect(cancelDownloadTool?.inputSchema?.properties?.downloadId).toMatchObject({ type: 'string' });
    expect(cancelDownloadTool?.inputSchema?.properties?.guid).toMatchObject({ type: 'string' });

    const uploadTool = tools.find((tool) => tool.name === 'browser_set_file_input');
    expect(uploadTool?.inputSchema?.properties?.selector).toMatchObject({ type: 'string' });
    expect(uploadTool?.inputSchema?.properties?.files).toMatchObject({ type: 'array' });
    expect(uploadTool?.inputSchema?.properties?.pageIndex).toMatchObject({ type: 'integer' });
    expect(uploadTool?.inputSchema?.properties?.pageId).toMatchObject({ type: 'string' });
    expect(uploadTool?.inputSchema?.properties?.nth).toMatchObject({ type: 'integer' });
    expect(uploadTool?.inputSchema?.properties?.frameSelector).toMatchObject({ type: 'string' });
    expect(uploadTool?.inputSchema?.properties?.pierceShadow).toMatchObject({ type: 'boolean' });

    const dragFilesTool = tools.find((tool) => tool.name === 'browser_drag_files');
    expect(dragFilesTool?.inputSchema?.properties?.selector).toMatchObject({ type: 'string' });
    expect(dragFilesTool?.inputSchema?.properties?.files).toMatchObject({ type: 'array' });
    expect(dragFilesTool?.inputSchema?.properties?.pageIndex).toMatchObject({ type: 'integer' });
    expect(dragFilesTool?.inputSchema?.properties?.pageId).toMatchObject({ type: 'string' });
    expect(dragFilesTool?.inputSchema?.properties?.nth).toMatchObject({ type: 'integer' });
    expect(dragFilesTool?.inputSchema?.properties?.frameSelector).toMatchObject({ type: 'string' });
    expect(dragFilesTool?.inputSchema?.properties?.pierceShadow).toMatchObject({ type: 'boolean' });

    const dragElementTool = tools.find((tool) => tool.name === 'browser_drag_element');
    expect(dragElementTool?.inputSchema?.properties?.selector).toMatchObject({ type: 'string' });
    expect(dragElementTool?.inputSchema?.properties?.targetSelector).toMatchObject({ type: 'string' });
    expect(dragElementTool?.inputSchema?.properties?.targetX).toMatchObject({ type: 'number' });
    expect(dragElementTool?.inputSchema?.properties?.targetY).toMatchObject({ type: 'number' });
    expect(dragElementTool?.inputSchema?.properties?.steps).toMatchObject({ type: 'integer' });

    const pointerTool = tools.find((tool) => tool.name === 'browser_pointer_action');
    expect(pointerTool?.inputSchema?.properties?.actions).toMatchObject({ type: 'array' });

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

  it('marks the selected page in browser_get_session_info', async () => {
    const responses = await runMcpRequests(
      [
        { id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' },
        { id: 'page-2', title: 'Docs', currentUrl: 'https://example.com/docs' },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 801,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageIndex: 1 } },
        },
        {
          jsonrpc: '2.0',
          id: 802,
          method: 'tools/call',
          params: { name: 'browser_get_session_info', arguments: {} },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 802));
    expect(text).toContain('selected: true');
    expect(text).toContain('1. Docs');
  });

  it('uses the selected page when pageIndex is omitted', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Home',
          currentUrl: 'https://example.com/',
          visibleText: 'Home text',
        },
        {
          id: 'page-2',
          title: 'Docs',
          currentUrl: 'https://example.com/docs',
          visibleText: 'Docs text',
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 811,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageIndex: 1 } },
        },
        {
          jsonrpc: '2.0',
          id: 812,
          method: 'tools/call',
          params: { name: 'browser_get_visible_text', arguments: {} },
        },
      ]
    );

    const text = getResponseText(responses.find((message) => message.id === 812));
    expect(text).toContain('Docs text');
  });

  it('opens a page and makes it selected', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 821,
          method: 'tools/call',
          params: {
            name: 'browser_open_page',
            arguments: { url: 'https://example.com/new' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 822,
          method: 'tools/call',
          params: { name: 'browser_get_session_info', arguments: {} },
        },
      ]
    );

    const openText = getResponseText(responses.find((message) => message.id === 821));
    expect(openText).toContain('status: opened');
    expect(openText).toContain('url: https://example.com/new');

    const listText = getResponseText(responses.find((message) => message.id === 822));
    expect(listText).toContain('https://example.com/new');
    expect(listText).toContain('selected: true');
  });

  it('closes the selected page and falls back deterministically', async () => {
    const responses = await runMcpRequests(
      [
        { id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' },
        { id: 'page-2', title: 'Docs', currentUrl: 'https://example.com/docs' },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 831,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageIndex: 1 } },
        },
        {
          jsonrpc: '2.0',
          id: 832,
          method: 'tools/call',
          params: { name: 'browser_close_page', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 833,
          method: 'tools/call',
          params: { name: 'browser_get_session_info', arguments: {} },
        },
      ]
    );

    const closeText = getResponseText(responses.find((message) => message.id === 832));
    expect(closeText).toContain('status: closed');

    const listText = getResponseText(responses.find((message) => message.id === 833));
    expect(listText).toContain('0. Home');
    expect(listText).toContain('selected: true');
    expect(listText).not.toContain('Docs');
  });

  it('keeps the selected page when closing a different page', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Home',
          currentUrl: 'https://example.com/',
          visibleText: 'Home text',
        },
        {
          id: 'page-2',
          title: 'Docs',
          currentUrl: 'https://example.com/docs',
          visibleText: 'Docs text',
        },
        {
          id: 'page-3',
          title: 'Pricing',
          currentUrl: 'https://example.com/pricing',
          visibleText: 'Pricing text',
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 834,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageIndex: 0 } },
        },
        {
          jsonrpc: '2.0',
          id: 835,
          method: 'tools/call',
          params: { name: 'browser_close_page', arguments: { pageId: 'page-3' } },
        },
        {
          jsonrpc: '2.0',
          id: 836,
          method: 'tools/call',
          params: { name: 'browser_get_visible_text', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 837,
          method: 'tools/call',
          params: { name: 'browser_get_session_info', arguments: {} },
        },
      ]
    );

    const visibleText = getResponseText(responses.find((message) => message.id === 836));
    expect(visibleText).toContain('Home text');

    const listText = getResponseText(responses.find((message) => message.id === 837));
    expect(listText).toContain('0. Home');
    expect(listText).toContain('selected: true');
    expect(listText).not.toContain('Pricing');
  });

  it('reconciles a stale selected page when browser_get_session_info is called', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 841,
          method: 'tools/call',
          params: { name: 'browser_open_page', arguments: { url: 'https://example.com/new' } },
        },
        {
          jsonrpc: '2.0',
          id: 842,
          method: 'tools/call',
          params: { name: 'browser_close_page', arguments: { pageId: 'page-2' } },
        },
        {
          jsonrpc: '2.0',
          id: 843,
          method: 'tools/call',
          params: { name: 'browser_get_session_info', arguments: {} },
        },
      ]
    );

    const listText = getResponseText(responses.find((message) => message.id === 843));
    expect(listText).toContain('0. Home');
    expect(listText).toContain('selected: true');
  });

  it('closes a page by pageId', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 851,
          method: 'tools/call',
          params: { name: 'browser_open_page', arguments: { url: 'https://example.com/new' } },
        },
        {
          jsonrpc: '2.0',
          id: 852,
          method: 'tools/call',
          params: { name: 'browser_close_page', arguments: { pageId: 'page-2' } },
        },
        {
          jsonrpc: '2.0',
          id: 853,
          method: 'tools/call',
          params: { name: 'browser_get_session_info', arguments: {} },
        },
      ]
    );

    const closeText = getResponseText(responses.find((message) => message.id === 852));
    expect(closeText).toContain('pageId: page-2');
    expect(closeText).toContain('status: closed');

    const listText = getResponseText(responses.find((message) => message.id === 853));
    expect(listText).toContain('0. Home');
    expect(listText).not.toContain('https://example.com/new');
  });

  it('adds an interception rule and lists it by bound pageId', async () => {
    const responses = await runMcpRequests(
      [
        { id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' },
        { id: 'page-2', title: 'Docs', currentUrl: 'https://example.com/docs' },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 901,
          method: 'tools/call',
          params: {
            name: 'browser_select_page',
            arguments: { pageIndex: 1 },
          },
        },
        {
          jsonrpc: '2.0',
          id: 902,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: { urlIncludes: '/api', method: 'GET', action: 'continue' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 903,
          method: 'tools/call',
          params: {
            name: 'browser_list_intercept_rules',
            arguments: {},
          },
        },
      ]
    );

    const listText = getResponseText(responses.find((message) => message.id === 903));
    expect(listText).toContain('pageId: page-2');
    expect(listText).toContain('urlIncludes: /api');
    expect(listText).toContain('method: GET');
    expect(listText).toContain('action: continue');
  });

  it('keeps an existing rule bound to the original page after selected page changes', async () => {
    const responses = await runMcpRequests(
      [
        { id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' },
        { id: 'page-2', title: 'Docs', currentUrl: 'https://example.com/docs' },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 911,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageIndex: 0 } },
        },
        {
          jsonrpc: '2.0',
          id: 912,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: { urlIncludes: '/api', method: 'POST', action: 'fail' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 913,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageIndex: 1 } },
        },
        {
          jsonrpc: '2.0',
          id: 914,
          method: 'tools/call',
          params: { name: 'browser_list_intercept_rules', arguments: {} },
        },
      ]
    );

    const listText = getResponseText(responses.find((message) => message.id === 914));
    expect(listText).toContain('pageId: page-1');
    expect(listText).toContain('method: POST');
    expect(listText).toContain('action: fail');
  });

  it('keeps richer matching rules bound to the original page after selected page changes', async () => {
    const responses = await runMcpRequests(
      [
        { id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' },
        { id: 'page-2', title: 'Docs', currentUrl: 'https://example.com/docs' },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 1003,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageIndex: 1 } },
        },
        {
          jsonrpc: '2.0',
          id: 1004,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              resourceType: 'XHR',
              priority: 7,
              action: 'continue',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 1005,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageIndex: 0 } },
        },
        {
          jsonrpc: '2.0',
          id: 1006,
          method: 'tools/call',
          params: { name: 'browser_list_intercept_rules', arguments: {} },
        },
      ]
    );

    const listText = getResponseText(responses.find((message) => message.id === 1006));
    expect(listText).toContain('pageId: page-2');
    expect(listText).toContain('resourceType: XHR');
    expect(listText).toContain('priority: 7');
  });

  it('removes an interception rule by ruleId', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 921,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: { urlIncludes: '/api', method: 'GET', action: 'continue' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 922,
          method: 'tools/call',
          params: {
            name: 'browser_remove_intercept_rule',
            arguments: { ruleId: 'rule-1' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 923,
          method: 'tools/call',
          params: { name: 'browser_list_intercept_rules', arguments: {} },
        },
      ]
    );

    const removeText = getResponseText(responses.find((message) => message.id === 922));
    expect(removeText).toContain('ruleId: rule-1');
    expect(removeText).toContain('status: removed');

    const listText = getResponseText(responses.find((message) => message.id === 923));
    expect(listText).toBe('status: empty');
  });

  it('records recent requests with matched rule action summaries', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Home',
          currentUrl: 'https://example.com/',
          intercept: {
            pausedRequests: [
              {
                requestId: 'req-1',
                url: 'https://example.com/api/users',
                method: 'GET',
                resourceType: 'XHR',
              },
              {
                requestId: 'req-2',
                url: 'https://example.com/assets/app.js',
                method: 'GET',
                resourceType: 'Script',
              },
            ],
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 931,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: { urlIncludes: '/api', method: 'GET', action: 'fail' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 932,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const listText = getResponseText(responses.find((message) => message.id === 932));
    expect(listText).toContain('requestId: req-1');
    expect(listText).toContain('matchedRuleId: rule-1');
    expect(listText).toContain('action: fail');
    expect(listText).toContain('requestId: req-2');
    expect(listText).toContain('action: continue');
  });

  it('removes rules and recent requests bound to a page after that page is closed', async () => {
    const responses = await runMcpRequests(
      [
        { id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' },
        {
          id: 'page-2',
          title: 'Docs',
          currentUrl: 'https://example.com/docs',
          intercept: {
            pausedRequests: [{ requestId: 'req-closed', url: 'https://example.com/api/docs', method: 'GET' }],
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 941,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageIndex: 1 } },
        },
        {
          jsonrpc: '2.0',
          id: 942,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: { urlIncludes: '/api', method: 'GET', action: 'continue' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 943,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 944,
          method: 'tools/call',
          params: { name: 'browser_close_page', arguments: { pageId: 'page-2' } },
        },
        {
          jsonrpc: '2.0',
          id: 945,
          method: 'tools/call',
          params: { name: 'browser_list_intercept_rules', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 946,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const preCloseRequestsText = getResponseText(responses.find((message) => message.id === 943));
    expect(preCloseRequestsText).toContain('requestId: req-closed');

    const listRulesText = getResponseText(responses.find((message) => message.id === 945));
    expect(listRulesText).not.toContain('pageId: page-2');

    const postCloseRequestsText = getResponseText(responses.find((message) => message.id === 946));
    expect(postCloseRequestsText).not.toContain('requestId: req-closed');
    expect(postCloseRequestsText).not.toContain('pageId: page-2');
  });

  it('rejects browser_add_intercept_rule when pageIndex and pageId are both provided', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 951,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              pageIndex: 0,
              pageId: 'page-1',
              urlIncludes: '/api',
              action: 'continue',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 951);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain('Browser MCP failed: pageIndex and pageId cannot be used together');
  });

  it('rejects browser_add_intercept_rule when action is invalid', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 952,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api',
              action: 'mock',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 952);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain('Browser MCP failed: action must be one of: continue, fail');
  });

  it('rejects intercept rules when urlPattern and urlRegex are both provided', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 981,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlPattern: 'https://example.com/api/*',
              urlRegex: '^https://example\\.com/api/',
              action: 'continue',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 981);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain('Browser MCP failed: urlPattern and urlRegex cannot be used together');
  });

  it('rejects intercept rules when priority is not an integer', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 982,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api',
              priority: 1.5,
              action: 'continue',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 982);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain('Browser MCP failed: priority must be an integer');
  });

  it('rejects intercept rules when headerMatchers is not an array', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 983,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              headerMatchers: 'x',
              action: 'continue',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 983);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain('Browser MCP failed: headerMatchers must be an array');
  });

  it('rejects intercept rules when a header matcher is missing name', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 984,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              headerMatchers: [{ valueIncludes: 'staging' }],
              action: 'continue',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 984);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain('Browser MCP failed: headerMatchers.name is required');
  });

  it('rejects intercept rules when a header matcher has no value matcher', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 985,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              headerMatchers: [{ name: 'x-env' }],
              action: 'continue',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 985);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain('Browser MCP failed: headerMatchers entry must include valueIncludes or valueRegex');
  });

  it('rejects intercept rules when no matching condition is provided', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 986,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              priority: 10,
              action: 'continue',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 986);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain('Browser MCP failed: at least one matching condition is required');
  });

  it('adds a resourceType interception rule and lists its richer matching summary', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 987,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              resourceType: 'XHR',
              priority: 10,
              action: 'continue',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 988,
          method: 'tools/call',
          params: { name: 'browser_list_intercept_rules', arguments: {} },
        },
      ]
    );

    const listText = getResponseText(responses.find((message) => message.id === 988));
    expect(listText).toContain('resourceType: XHR');
    expect(listText).toContain('priority: 10');
  });

  it('prefers the higher-priority matched rule over an earlier lower-priority rule', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Home',
        currentUrl: 'https://example.com/',
        intercept: {
          pausedRequests: [
            {
              requestId: 'req-priority',
              url: 'https://example.com/api/orders',
              method: 'GET',
              resourceType: 'XHR',
            },
          ],
        },
      },
    ];
    const responses = await runMcpRequests(
      pages,
      [
        {
          jsonrpc: '2.0',
          id: 989,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api',
              action: 'fulfill',
              statusCode: 201,
              body: 'low',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 990,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              resourceType: 'XHR',
              priority: 10,
              action: 'fulfill',
              statusCode: 202,
              body: 'high',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 991,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const listText = getResponseText(responses.find((message) => message.id === 991));
    expect(listText).toContain('requestId: req-priority');
    expect(listText).toContain('matchedRuleId: rule-2');
    expect(pages[0]?.intercept?.fulfilledRequests?.[0]?.responseCode).toBe(202);
  });

  it('keeps creation order when matched rules have the same priority', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Home',
        currentUrl: 'https://example.com/',
        intercept: {
          pausedRequests: [
            {
              requestId: 'req-same-priority',
              url: 'https://example.com/api/orders',
              method: 'GET',
              resourceType: 'XHR',
            },
          ],
        },
      },
    ];
    const responses = await runMcpRequests(
      pages,
      [
        {
          jsonrpc: '2.0',
          id: 9911,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api',
              priority: 5,
              action: 'fulfill',
              statusCode: 201,
              body: 'first',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 9912,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              resourceType: 'XHR',
              priority: 5,
              action: 'fulfill',
              statusCode: 202,
              body: 'second',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 9913,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const listText = getResponseText(responses.find((message) => message.id === 9913));
    expect(listText).toContain('requestId: req-same-priority');
    expect(listText).toContain('matchedRuleId: rule-1');
    expect(pages[0]?.intercept?.fulfilledRequests?.[0]?.responseCode).toBe(201);
  });

  it('matches urlPattern rules with wildcard syntax', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Home',
        currentUrl: 'https://example.com/',
        intercept: {
          pausedRequests: [
            {
              requestId: 'req-pattern',
              url: 'https://example.com/api/v1/users',
              method: 'GET',
            },
          ],
        },
      },
    ];
    const responses = await runMcpRequests(
      pages,
      [
        {
          jsonrpc: '2.0',
          id: 992,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlPattern: 'https://example.com/api/*',
              action: 'fail',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 993,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const listText = getResponseText(responses.find((message) => message.id === 993));
    expect(listText).toContain('requestId: req-pattern');
    expect(listText).toContain('action: fail');
    expect(pages[0]?.intercept?.failedRequests?.[0]?.requestId).toBe('req-pattern');
  });

  it('matches urlRegex rules', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Home',
        currentUrl: 'https://example.com/',
        intercept: {
          pausedRequests: [
            {
              requestId: 'req-regex',
              url: 'https://example.com/api/users',
              method: 'GET',
            },
          ],
        },
      },
    ];
    const responses = await runMcpRequests(
      pages,
      [
        {
          jsonrpc: '2.0',
          id: 994,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlRegex: '^https://example\\.com/api/(users|teams)$',
              action: 'continue',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 995,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const listText = getResponseText(responses.find((message) => message.id === 995));
    expect(listText).toContain('requestId: req-regex');
    expect(listText).toContain('matchedRuleId: rule-1');
    expect(pages[0]?.intercept?.continuedRequestIds).toContain('req-regex');
  });

  it('matches headerMatchers using valueIncludes and case-insensitive header names', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Home',
        currentUrl: 'https://example.com/',
        intercept: {
          pausedRequests: [
            {
              requestId: 'req-header-includes',
              url: 'https://example.com/api/header-includes',
              method: 'GET',
              requestHeaders: {
                'X-Env': 'staging-us',
              },
            },
          ],
        },
      },
    ];
    const responses = await runMcpRequests(
      pages,
      [
        {
          jsonrpc: '2.0',
          id: 996,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              headerMatchers: [{ name: 'x-env', valueIncludes: 'staging' }],
              action: 'fulfill',
              statusCode: 207,
              body: 'matched-includes',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 997,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const listText = getResponseText(responses.find((message) => message.id === 997));
    expect(listText).toContain('requestId: req-header-includes');
    expect(listText).toContain('matchedRuleId: rule-1');
    expect(pages[0]?.intercept?.fulfilledRequests?.[0]?.responseCode).toBe(207);
  });

  it('matches headerMatchers using valueRegex', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Home',
        currentUrl: 'https://example.com/',
        intercept: {
          pausedRequests: [
            {
              requestId: 'req-header-regex',
              url: 'https://example.com/api/header-regex',
              method: 'GET',
              requestHeaders: {
                'x-tenant': 'acme-prod',
              },
            },
          ],
        },
      },
    ];
    const responses = await runMcpRequests(
      pages,
      [
        {
          jsonrpc: '2.0',
          id: 998,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              headerMatchers: [{ name: 'X-Tenant', valueRegex: '^acme-' }],
              action: 'continue',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 999,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const listText = getResponseText(responses.find((message) => message.id === 999));
    expect(listText).toContain('requestId: req-header-regex');
    expect(listText).toContain('matchedRuleId: rule-1');
    expect(pages[0]?.intercept?.continuedRequestIds).toContain('req-header-regex');
  });

  it('adds a fulfill interception rule and lists its response summary', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 961,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api/mock',
              method: 'GET',
              action: 'fulfill',
              statusCode: 202,
              contentType: 'application/json',
              body: '{"ok":true}',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 962,
          method: 'tools/call',
          params: { name: 'browser_list_intercept_rules', arguments: {} },
        },
      ]
    );

    const listText = getResponseText(responses.find((message) => message.id === 962));
    expect(listText).toContain('action: fulfill');
    expect(listText).toContain('statusCode: 202');
    expect(listText).toContain('contentType: application/json');
  });

  it('fulfills a paused request with the configured mock response', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Home',
        currentUrl: 'https://example.com/',
        intercept: {
          pausedRequests: [
            {
              requestId: 'req-fulfill-1',
              url: 'https://example.com/api/mock/users',
              method: 'GET',
              resourceType: 'XHR',
            },
          ],
        },
      },
    ];
    const responses = await runMcpRequests(
      pages,
      [
        {
          jsonrpc: '2.0',
          id: 963,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api/mock',
              method: 'GET',
              action: 'fulfill',
              statusCode: 200,
              contentType: 'application/json',
              body: '{"users":[1]}',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 964,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const listText = getResponseText(responses.find((message) => message.id === 964));
    expect(listText).toContain('requestId: req-fulfill-1');
    expect(listText).toContain('matchedRuleId: rule-1');
    expect(listText).toContain('action: fulfill');
    expect(pages[0]?.intercept?.fulfilledRequests).toEqual([
      expect.objectContaining({
        requestId: 'req-fulfill-1',
        responseCode: 200,
      }),
    ]);
  });

  it('passes custom response headers to Fetch.fulfillRequest', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Home',
        currentUrl: 'https://example.com/',
        intercept: {
          pausedRequests: [
            {
              requestId: 'req-fulfill-2',
              url: 'https://example.com/api/mock/headers',
              method: 'GET',
            },
          ],
        },
      },
    ];
    const responses = await runMcpRequests(
      pages,
      [
        {
          jsonrpc: '2.0',
          id: 965,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api/mock/headers',
              action: 'fulfill',
              statusCode: 201,
              responseHeaders: [
                { name: 'Cache-Control', value: 'no-store' },
                { name: 'X-Mocked-By', value: 'ccs-browser' },
              ],
              body: 'ok',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 966,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const listText = getResponseText(responses.find((message) => message.id === 966));
    expect(listText).toContain('action: fulfill');
    expect(pages[0]?.intercept?.fulfilledRequests?.[0]?.responseHeaders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Cache-Control', value: 'no-store' }),
        expect.objectContaining({ name: 'X-Mocked-By', value: 'ccs-browser' }),
      ])
    );
  });

  it('allows fulfill rules with an empty response body', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 967,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api/empty',
              action: 'fulfill',
              statusCode: 204,
              contentType: 'text/plain',
              body: '',
            },
          },
        },
      ]
    );

    const addText = getResponseText(responses.find((message) => message.id === 967));
    expect(addText).toContain('action: fulfill');
    expect(addText).toContain('statusCode: 204');
  });

  it('rejects fulfill rules when statusCode is out of range', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 968,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api/mock',
              action: 'fulfill',
              statusCode: 99,
              body: 'x',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 968);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain('Browser MCP failed: statusCode must be an integer between 100 and 599');
  });

  it('rejects fulfill rules when responseHeaders is not an array', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 969,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api/mock',
              action: 'fulfill',
              responseHeaders: 'x',
              body: 'x',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 969);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain('Browser MCP failed: responseHeaders must be an array');
  });

  it('rejects fulfill rules when a responseHeaders entry is missing name', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 970,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api/mock',
              action: 'fulfill',
              responseHeaders: [{ value: 'x' }],
              body: 'x',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 970);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain('Browser MCP failed: responseHeaders.name is required');
  });

  it('rejects fulfill rules when body is not a string', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 971,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api/mock',
              action: 'fulfill',
              body: 123,
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 971);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain('Browser MCP failed: body must be a string');
  });

  it('rejects intercept rules when urlRegex is invalid', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 1001,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlRegex: '[',
              action: 'continue',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 1001);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain('Browser MCP failed: urlRegex must be a valid regular expression');
  });

  it('rejects intercept rules when headerMatchers.valueRegex is invalid', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' }],
      [
        {
          jsonrpc: '2.0',
          id: 1002,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              headerMatchers: [{ name: 'x-env', valueRegex: '[' }],
              action: 'continue',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 1002);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain('Browser MCP failed: headerMatchers.valueRegex must be a valid regular expression');
  });

  it('removes fulfill rules and request summaries after the bound page is closed', async () => {
    const responses = await runMcpRequests(
      [
        { id: 'page-1', title: 'Home', currentUrl: 'https://example.com/' },
        {
          id: 'page-2',
          title: 'Mocked',
          currentUrl: 'https://example.com/mocked',
          intercept: {
            pausedRequests: [
              { requestId: 'req-fulfill-close', url: 'https://example.com/api/mock/close', method: 'GET' },
            ],
          },
        },
      ],
      [
        { jsonrpc: '2.0', id: 972, method: 'tools/call', params: { name: 'browser_select_page', arguments: { pageIndex: 1 } } },
        {
          jsonrpc: '2.0',
          id: 973,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: {
              urlIncludes: '/api/mock/close',
              action: 'fulfill',
              statusCode: 200,
              body: 'done',
            },
          },
        },
        { jsonrpc: '2.0', id: 974, method: 'tools/call', params: { name: 'browser_list_requests', arguments: {} } },
        { jsonrpc: '2.0', id: 975, method: 'tools/call', params: { name: 'browser_close_page', arguments: { pageId: 'page-2' } } },
        { jsonrpc: '2.0', id: 976, method: 'tools/call', params: { name: 'browser_list_intercept_rules', arguments: {} } },
        { jsonrpc: '2.0', id: 977, method: 'tools/call', params: { name: 'browser_list_requests', arguments: {} } },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    expect(getResponseText(responses.find((message) => message.id === 974))).toContain('requestId: req-fulfill-close');
    expect(getResponseText(responses.find((message) => message.id === 976))).not.toContain('pageId: page-2');
    expect(getResponseText(responses.find((message) => message.id === 977))).not.toContain('requestId: req-fulfill-close');
  });

  it('returns only the requested number of recent requests', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Home',
          currentUrl: 'https://example.com/',
          intercept: {
            pausedRequests: [
              { requestId: 'req-1', url: 'https://example.com/api/one', method: 'GET', resourceType: 'XHR' },
              { requestId: 'req-2', url: 'https://example.com/api/two', method: 'GET', resourceType: 'XHR' },
            ],
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 953,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: { urlIncludes: '/api', method: 'GET', action: 'continue' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 954,
          method: 'tools/call',
          params: { name: 'browser_list_requests', arguments: { limit: 1 } },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const listText = getResponseText(responses.find((message) => message.id === 954));
    expect(listText).toContain('requestId: req-2');
    expect(listText).not.toContain('requestId: req-1');
  });

  it('fails browser_add_intercept_rule when Fetch.enable fails', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Home',
          currentUrl: 'https://example.com/',
          intercept: {
            enableError: 'Fetch.enable blocked',
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 955,
          method: 'tools/call',
          params: {
            name: 'browser_add_intercept_rule',
            arguments: { urlIncludes: '/api', action: 'continue' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 956,
          method: 'tools/call',
          params: { name: 'browser_list_intercept_rules', arguments: {} },
        },
      ],
      {
        responseTimeoutMs: 12000,
      }
    );

    const addResponse = responses.find((message) => message.id === 955);
    expect((addResponse?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(addResponse)).toContain('Browser MCP failed: Fetch.enable blocked');

    const listText = getResponseText(responses.find((message) => message.id === 956));
    expect(listText).toBe('status: empty');
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

  it('applies browser-scoped download behavior, records download summaries, and cancels an in-progress download', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Reports',
        currentUrl: 'https://example.com/reports',
        browser: {},
        events: {
          downloads: [
            {
              guid: 'download-guid-1',
              url: 'https://example.com/files/report.csv',
              suggestedFilename: 'report.csv',
              progress: [{ receivedBytes: 5, totalBytes: 10, state: 'inProgress' }],
            },
          ],
        },
      },
    ];

    const responses = await runMcpRequests(
      pages,
      [
        {
          jsonrpc: '2.0',
          id: 57,
          method: 'tools/call',
          params: {
            name: 'browser_set_download_behavior',
            arguments: { behavior: 'accept', eventsEnabled: true },
          },
        },
        {
          jsonrpc: '2.0',
          id: 58,
          method: 'tools/call',
          params: { name: 'browser_list_downloads', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 59,
          method: 'tools/call',
          params: {
            name: 'browser_cancel_download',
            arguments: { guid: 'download-guid-1' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 60,
          method: 'tools/call',
          params: { name: 'browser_list_downloads', arguments: {} },
        },
      ],
      { responseTimeoutMs: 12000 }
    );

    expect(getResponseText(responses.find((message) => message.id === 57))).toContain('scope: browser');
    expect(getResponseText(responses.find((message) => message.id === 58))).toContain('suggestedFilename: report.csv');
    expect(getResponseText(responses.find((message) => message.id === 60))).toContain('status: canceled');
    expect(pages[0]?.browser?.setDownloadBehaviorCalls?.[0]?.behavior).toBe('allow');
    expect(pages[0]?.browser?.canceledDownloadGuids).toContain('download-guid-1');
  });

  it('rejects browser_set_download_behavior when behavior is deny and downloadPath is provided', async () => {
    const responses = await runMcpRequests(
      [{ id: 'page-1', title: 'Reports', currentUrl: 'https://example.com/reports' }],
      [
        {
          jsonrpc: '2.0',
          id: 61,
          method: 'tools/call',
          params: {
            name: 'browser_set_download_behavior',
            arguments: {
              behavior: 'deny',
              downloadPath: '/tmp/blocked-downloads',
            },
          },
        },
      ]
    );

    const response = responses.find((message) => message.id === 61);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain(
      'Browser MCP failed: downloadPath is only allowed when behavior=accept'
    );
  });

  it('rejects browser_cancel_download for completed downloads', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Reports',
        currentUrl: 'https://example.com/reports',
        browser: {},
        events: {
          downloads: [
            {
              guid: 'download-guid-complete',
              url: 'https://example.com/files/report.csv',
              suggestedFilename: 'report.csv',
              progress: [{ receivedBytes: 10, totalBytes: 10, state: 'completed' }],
            },
          ],
        },
      },
    ];

    const responses = await runMcpRequests(
      pages,
      [
        {
          jsonrpc: '2.0',
          id: 610,
          method: 'tools/call',
          params: {
            name: 'browser_set_download_behavior',
            arguments: { behavior: 'accept', eventsEnabled: true },
          },
        },
        {
          jsonrpc: '2.0',
          id: 611,
          method: 'tools/call',
          params: { name: 'browser_list_downloads', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 612,
          method: 'tools/call',
          params: {
            name: 'browser_cancel_download',
            arguments: { guid: 'download-guid-complete' },
          },
        },
      ],
      { responseTimeoutMs: 12000 }
    );

    expect(getResponseText(responses.find((message) => message.id === 611))).toContain('status: completed');
    const response = responses.find((message) => message.id === 612);
    expect((response?.result as { isError?: boolean }).isError).toBe(true);
    expect(getResponseText(response)).toContain(
      'Browser MCP failed: download is not cancelable in status: completed'
    );
    expect(pages[0]?.browser?.canceledDownloadGuids).toBeUndefined();
  });

  it('waits for a matching download event with browser_wait_for_event after Phase 8 changes', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Event Page',
          currentUrl: 'https://example.com/',
          events: {
            downloads: [
              {
                guid: 'download-guid-2',
                url: 'https://example.com/files/export.zip',
                suggestedFilename: 'export.zip',
              },
            ],
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 62,
          method: 'tools/call',
          params: {
            name: 'browser_wait_for_event',
            arguments: {
              timeoutMs: 1000,
              event: { kind: 'download', suggestedFilenameIncludes: 'export.zip' },
            },
          },
        },
      ],
      { responseTimeoutMs: 12000 }
    );

    expect(getResponseText(responses.find((message) => message.id === 62))).toContain('status: observed');
  });

  it('sets files on selected-page, frameSelector, and pierceShadow file inputs', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ccs-browser-upload-'));
    const invoicePath = join(tempDir, 'invoice.pdf');
    const receiptPath = join(tempDir, 'receipt.png');
    writeFileSync(invoicePath, 'invoice');
    writeFileSync(receiptPath, 'receipt');

    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Root Uploads',
        currentUrl: 'https://example.com/root',
        fileInputs: {
          '#root-upload': { kind: 'file', multiple: true },
        },
        frames: [
          {
            selector: '#upload-frame',
            fileInputs: {
              '#frame-upload': { kind: 'file', multiple: true },
            },
          },
        ],
        shadowRoots: [
          {
            hostSelector: 'upload-panel',
            fileInputs: {
              '#shadow-upload': { kind: 'file' },
            },
          },
        ],
      },
      {
        id: 'page-2',
        title: 'Selected Uploads',
        currentUrl: 'https://example.com/selected',
        fileInputs: {
          '#selected-upload': { kind: 'file', multiple: true },
        },
      },
    ];

    const responses = await runMcpRequests(
      pages,
      [
        {
          jsonrpc: '2.0',
          id: 63,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageIndex: 1 } },
        },
        {
          jsonrpc: '2.0',
          id: 64,
          method: 'tools/call',
          params: {
            name: 'browser_set_file_input',
            arguments: { selector: '#selected-upload', files: [invoicePath, receiptPath] },
          },
        },
        {
          jsonrpc: '2.0',
          id: 65,
          method: 'tools/call',
          params: {
            name: 'browser_set_file_input',
            arguments: {
              pageIndex: 0,
              selector: '#frame-upload',
              files: [invoicePath],
              frameSelector: '#upload-frame',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 66,
          method: 'tools/call',
          params: {
            name: 'browser_set_file_input',
            arguments: {
              pageIndex: 0,
              selector: '#shadow-upload',
              files: [receiptPath],
              pierceShadow: true,
            },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 64))).toContain('pageIndex: 1');
    expect(getResponseText(responses.find((message) => message.id === 65))).toContain('frameSelector: #upload-frame');
    expect(getResponseText(responses.find((message) => message.id === 66))).toContain('pierceShadow: true');

    expect((pages[1]?.fileInputs?.['#selected-upload'] as MockFileInputState).assignedFiles).toEqual([
      invoicePath,
      receiptPath,
    ]);
    expect(
      (pages[0]?.frames?.[0]?.fileInputs?.['#frame-upload'] as MockFileInputState).assignedFiles
    ).toEqual([invoicePath]);
    expect(
      (pages[0]?.shadowRoots?.[0]?.fileInputs?.['#shadow-upload'] as MockFileInputState).assignedFiles
    ).toEqual([receiptPath]);
  });

  it('uses pageId for browser_set_file_input when provided', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ccs-browser-upload-'));
    const assetPath = join(tempDir, 'asset.txt');
    writeFileSync(assetPath, 'asset');

    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Selected Uploads',
        currentUrl: 'https://example.com/selected',
        fileInputs: {
          '#selected-upload': { kind: 'file' },
        },
      },
      {
        id: 'page-2',
        title: 'Explicit Uploads',
        currentUrl: 'https://example.com/explicit',
        fileInputs: {
          '#pageid-upload': { kind: 'file' },
        },
      },
    ];

    const responses = await runMcpRequests(
      pages,
      [
        {
          jsonrpc: '2.0',
          id: 67,
          method: 'tools/call',
          params: { name: 'browser_select_page', arguments: { pageId: 'page-1' } },
        },
        {
          jsonrpc: '2.0',
          id: 68,
          method: 'tools/call',
          params: {
            name: 'browser_set_file_input',
            arguments: { pageId: 'page-2', selector: '#pageid-upload', files: [assetPath] },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 68))).toContain('pageIndex: 1');
    expect((pages[1]?.fileInputs?.['#pageid-upload'] as MockFileInputState).assignedFiles).toEqual([
      assetPath,
    ]);
    expect((pages[0]?.fileInputs?.['#selected-upload'] as MockFileInputState).assignedFiles).toBeUndefined();
  });

  it('rejects browser_set_file_input when target is not a file input, local file is missing, or page selectors conflict', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ccs-browser-upload-'));
    const okPath = join(tempDir, 'ok.txt');
    const missingPath = join(tempDir, 'missing.txt');
    writeFileSync(okPath, 'ok');

    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Upload Errors',
          currentUrl: 'https://example.com/',
          fileInputs: {
            '#real-file-input': { kind: 'file' },
            '#not-file-input': { kind: 'nonfile' },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 69,
          method: 'tools/call',
          params: {
            name: 'browser_set_file_input',
            arguments: { selector: '#not-file-input', files: [okPath] },
          },
        },
        {
          jsonrpc: '2.0',
          id: 70,
          method: 'tools/call',
          params: {
            name: 'browser_set_file_input',
            arguments: { selector: '#real-file-input', files: [missingPath] },
          },
        },
        {
          jsonrpc: '2.0',
          id: 71,
          method: 'tools/call',
          params: {
            name: 'browser_set_file_input',
            arguments: { pageIndex: 0, pageId: 'page-1', selector: '#real-file-input', files: [okPath] },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 69))).toContain(
      'element is not a file input for selector: #not-file-input'
    );
    expect(getResponseText(responses.find((message) => message.id === 70))).toContain(
      `file does not exist: ${missingPath}`
    );
    expect(getResponseText(responses.find((message) => message.id === 71))).toContain(
      'pageIndex and pageId cannot be used together'
    );
  });

  it('drags local files onto normal, frame, and shadow dropzones', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ccs-browser-drag-files-'));
    const invoicePath = join(tempDir, 'invoice.pdf');
    const receiptPath = join(tempDir, 'receipt.png');
    writeFileSync(invoicePath, 'invoice');
    writeFileSync(receiptPath, 'receipt');

    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Uploads',
        currentUrl: 'https://example.com/uploads',
        dropzones: {
          '#dropzone': { accepted: true },
        },
        frames: [
          {
            selector: '#upload-frame',
            dropzones: {
              '#frame-dropzone': { accepted: true },
            },
          },
        ],
        shadowRoots: [
          {
            hostSelector: 'upload-panel',
            dropzones: {
              '#shadow-dropzone': { accepted: true },
            },
          },
        ],
      },
    ];

    const responses = await runMcpRequests(pages, [
      {
        jsonrpc: '2.0',
        id: 901,
        method: 'tools/call',
        params: {
          name: 'browser_drag_files',
          arguments: { selector: '#dropzone', files: [invoicePath, receiptPath] },
        },
      },
      {
        jsonrpc: '2.0',
        id: 902,
        method: 'tools/call',
        params: {
          name: 'browser_drag_files',
          arguments: {
            selector: '#frame-dropzone',
            files: [invoicePath],
            frameSelector: '#upload-frame',
          },
        },
      },
      {
        jsonrpc: '2.0',
        id: 903,
        method: 'tools/call',
        params: {
          name: 'browser_drag_files',
          arguments: {
            selector: '#shadow-dropzone',
            files: [receiptPath],
            pierceShadow: true,
          },
        },
      },
    ]);

    expect(getResponseText(responses.find((message) => message.id === 901))).toContain('status: files-dropped');
    expect(getMockDropzoneState(pages[0]!, '#dropzone')?.receivedEventTypes).toEqual([
      'dragenter',
      'dragover',
      'drop',
    ]);
    expect(getMockDropzoneState(pages[0]!, '#dropzone')?.receivedFiles).toEqual([
      { name: 'invoice.pdf', size: 7, type: 'application/pdf' },
      { name: 'receipt.png', size: 7, type: 'image/png' },
    ]);
    expect(
      getMockDropzoneState(pages[0]!, '#frame-dropzone', { frameSelector: '#upload-frame' })?.receivedFiles
    ).toEqual([{ name: 'invoice.pdf', size: 7, type: 'application/pdf' }]);
    expect(
      getMockDropzoneState(pages[0]!, '#shadow-dropzone', { pierceShadow: true })?.receivedFiles
    ).toEqual([{ name: 'receipt.png', size: 7, type: 'image/png' }]);
  });

  it('rejects browser_drag_files for missing files, page conflicts, missing targets, and rejected drops', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ccs-browser-drag-files-'));
    const okPath = join(tempDir, 'ok.txt');
    const missingPath = join(tempDir, 'missing.txt');
    writeFileSync(okPath, 'ok');

    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Uploads',
          currentUrl: 'https://example.com/uploads',
          dropzones: {
            '#reject-dropzone': { accepted: false },
          },
        },
      ],
      [
        {
          jsonrpc: '2.0',
          id: 904,
          method: 'tools/call',
          params: {
            name: 'browser_drag_files',
            arguments: { selector: '#reject-dropzone', files: [missingPath] },
          },
        },
        {
          jsonrpc: '2.0',
          id: 905,
          method: 'tools/call',
          params: {
            name: 'browser_drag_files',
            arguments: { pageIndex: 0, pageId: 'page-1', selector: '#reject-dropzone', files: [okPath] },
          },
        },
        {
          jsonrpc: '2.0',
          id: 906,
          method: 'tools/call',
          params: {
            name: 'browser_drag_files',
            arguments: { selector: '#missing-dropzone', files: [okPath] },
          },
        },
        {
          jsonrpc: '2.0',
          id: 907,
          method: 'tools/call',
          params: {
            name: 'browser_drag_files',
            arguments: { selector: '#reject-dropzone', files: [okPath] },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 904))).toContain('file does not exist');
    expect(getResponseText(responses.find((message) => message.id === 905))).toContain(
      'pageIndex and pageId cannot be used together'
    );
    expect(getResponseText(responses.find((message) => message.id === 906))).toContain(
      'element not found for selector: #missing-dropzone'
    );
    expect(getResponseText(responses.find((message) => message.id === 907))).toContain(
      'drop target rejected files'
    );
  });

  it('drags an element to another element and to explicit coordinates', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Drag Page',
        currentUrl: 'https://example.com/drag',
        query: {
          '#card-a': {
            exists: true,
            connected: true,
            rect: {
              x: 20,
              y: 40,
              width: 100,
              height: 60,
              top: 40,
              right: 120,
              bottom: 100,
              left: 20,
            },
            display: 'block',
            visibility: 'visible',
            opacity: '1',
          },
          '#lane-b': {
            exists: true,
            connected: true,
            rect: {
              x: 240,
              y: 60,
              width: 120,
              height: 80,
              top: 60,
              right: 360,
              bottom: 140,
              left: 240,
            },
            display: 'block',
            visibility: 'visible',
            opacity: '1',
          },
        },
      },
      {
        id: 'page-2',
        title: 'Second Drag Page',
        currentUrl: 'https://example.com/drag-2',
        query: {
          '#card-a': {
            exists: true,
            connected: true,
            rect: {
              x: 10,
              y: 20,
              width: 40,
              height: 20,
              top: 20,
              right: 50,
              bottom: 40,
              left: 10,
            },
            display: 'block',
            visibility: 'visible',
            opacity: '1',
          },
          '#lane-b': {
            exists: true,
            connected: true,
            rect: {
              x: 110,
              y: 80,
              width: 60,
              height: 30,
              top: 80,
              right: 170,
              bottom: 110,
              left: 110,
            },
            display: 'block',
            visibility: 'visible',
            opacity: '1',
          },
        },
      },
    ];

    const responses = await runMcpRequests(pages, [
      {
        jsonrpc: '2.0',
        id: 908,
        method: 'tools/call',
        params: {
          name: 'browser_drag_element',
          arguments: { selector: '#card-a', targetSelector: '#lane-b', steps: 3 },
        },
      },
      {
        jsonrpc: '2.0',
        id: 909,
        method: 'tools/call',
        params: {
          name: 'browser_drag_element',
          arguments: { selector: '#card-a', targetX: 420, targetY: 180, steps: 2 },
        },
      },
      {
        jsonrpc: '2.0',
        id: 916,
        method: 'tools/call',
        params: {
          name: 'browser_drag_element',
          arguments: { pageId: 'page-2', selector: '#card-a', targetSelector: '#lane-b', steps: 1 },
        },
      },
    ]);

    expect(getResponseText(responses.find((message) => message.id === 908))).toContain('status: dragged');
    expect(getResponseText(responses.find((message) => message.id === 908))).toContain('targetSelector: #lane-b');
    expect(getResponseText(responses.find((message) => message.id === 909))).toContain('status: dragged');
    expect(getResponseText(responses.find((message) => message.id === 909))).toContain('targetX: 420');
    expect(getResponseText(responses.find((message) => message.id === 909))).toContain('targetY: 180');
    expect(getResponseText(responses.find((message) => message.id === 916))).toContain('pageIndex: 1');
    expect(getResponseText(responses.find((message) => message.id === 916))).toContain('targetSelector: #lane-b');
    expect(pages[0]!.drag?.recordedActions).toEqual([
      { type: 'mouseMoved', x: 70, y: 70, button: 'none' },
      { type: 'mousePressed', x: 70, y: 70, button: 'left' },
      { type: 'mouseMoved', x: 147, y: 80, button: 'left' },
      { type: 'mouseMoved', x: 223, y: 90, button: 'left' },
      { type: 'mouseMoved', x: 300, y: 100, button: 'left' },
      { type: 'mouseReleased', x: 300, y: 100, button: 'left' },
      { type: 'mouseMoved', x: 70, y: 70, button: 'none' },
      { type: 'mousePressed', x: 70, y: 70, button: 'left' },
      { type: 'mouseMoved', x: 245, y: 125, button: 'left' },
      { type: 'mouseMoved', x: 420, y: 180, button: 'left' },
      { type: 'mouseReleased', x: 420, y: 180, button: 'left' },
    ]);
    expect(pages[1]!.drag?.recordedActions).toEqual([
      { type: 'mouseMoved', x: 30, y: 30, button: 'none' },
      { type: 'mousePressed', x: 30, y: 30, button: 'left' },
      { type: 'mouseMoved', x: 140, y: 95, button: 'left' },
      { type: 'mouseReleased', x: 140, y: 95, button: 'left' },
    ]);
  });

  it('rejects invalid browser_drag_element target combinations, page conflicts, and missing elements', async () => {
    const responses = await runMcpRequests(
      [
        {
          id: 'page-1',
          title: 'Drag Failures',
          currentUrl: 'https://example.com/drag',
          query: {
            '#card-a': {
              exists: true,
              connected: true,
              rect: {
                x: 20,
                y: 40,
                width: 100,
                height: 60,
                top: 40,
                right: 120,
                bottom: 100,
                left: 20,
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
          id: 910,
          method: 'tools/call',
          params: {
            name: 'browser_drag_element',
            arguments: { selector: '#card-a', targetSelector: '#lane-b', targetX: 400, targetY: 200 },
          },
        },
        {
          jsonrpc: '2.0',
          id: 911,
          method: 'tools/call',
          params: {
            name: 'browser_drag_element',
            arguments: { selector: '#missing-source', targetX: 400, targetY: 200 },
          },
        },
        {
          jsonrpc: '2.0',
          id: 912,
          method: 'tools/call',
          params: {
            name: 'browser_drag_element',
            arguments: { selector: '#card-a', targetSelector: '#missing-target' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 917,
          method: 'tools/call',
          params: {
            name: 'browser_drag_element',
            arguments: { pageIndex: 0, pageId: 'page-1', selector: '#card-a', targetX: 400, targetY: 200 },
          },
        },
      ]
    );

    expect(getResponseText(responses.find((message) => message.id === 910))).toContain(
      'targetSelector and targetX/targetY cannot be used together'
    );
    expect(getResponseText(responses.find((message) => message.id === 911))).toContain(
      'source element not found'
    );
    expect(getResponseText(responses.find((message) => message.id === 912))).toContain(
      'target element not found'
    );
    expect(getResponseText(responses.find((message) => message.id === 917))).toContain(
      'pageIndex and pageId cannot be used together'
    );
  });

  it('runs minimal pointer sequences with browser_pointer_action', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Pointer Page',
        currentUrl: 'https://example.com/pointer',
        query: {
          '#handle': {
            exists: true,
            connected: true,
            rect: {
              x: 30,
              y: 50,
              width: 40,
              height: 20,
              top: 50,
              right: 70,
              bottom: 70,
              left: 30,
            },
            display: 'block',
            visibility: 'visible',
            opacity: '1',
          },
        },
      },
      {
        id: 'page-2',
        title: 'Second Pointer Page',
        currentUrl: 'https://example.com/pointer-2',
        query: {
          '#handle': {
            exists: true,
            connected: true,
            rect: {
              x: 100,
              y: 200,
              width: 20,
              height: 20,
              top: 200,
              right: 120,
              bottom: 220,
              left: 100,
            },
            display: 'block',
            visibility: 'visible',
            opacity: '1',
          },
        },
      },
    ];

    const responses = await runMcpRequests(pages, [
      {
        jsonrpc: '2.0',
        id: 913,
        method: 'tools/call',
        params: {
          name: 'browser_pointer_action',
          arguments: {
            actions: [
              { type: 'move', selector: '#handle' },
              { type: 'down' },
              { type: 'move', x: 220, y: 160 },
              { type: 'pause', durationMs: 5 },
              { type: 'up' },
            ],
          },
        },
      },
      {
        jsonrpc: '2.0',
        id: 918,
        method: 'tools/call',
        params: {
          name: 'browser_pointer_action',
          arguments: {
            pageId: 'page-2',
            actions: [
              { type: 'move', selector: '#handle' },
              { type: 'down' },
              { type: 'up' },
            ],
          },
        },
      },
    ]);

    expect(getResponseText(responses.find((message) => message.id === 913))).toContain('status: pointer-actions-completed');
    expect(getResponseText(responses.find((message) => message.id === 918))).toContain('pageIndex: 1');
    expect(getResponseText(responses.find((message) => message.id === 918))).toContain('status: pointer-actions-completed');
    expect(pages[0]!.drag?.recordedActions).toEqual([
      { type: 'mouseMoved', x: 50, y: 60, button: 'none' },
      { type: 'mousePressed', x: 50, y: 60, button: 'left' },
      { type: 'mouseMoved', x: 220, y: 160, button: 'left' },
      { type: 'mouseReleased', x: 220, y: 160, button: 'left' },
    ]);
    expect(pages[1]!.drag?.recordedActions).toEqual([
      { type: 'mouseMoved', x: 110, y: 210, button: 'none' },
      { type: 'mousePressed', x: 110, y: 210, button: 'left' },
      { type: 'mouseReleased', x: 110, y: 210, button: 'left' },
    ]);
  });

  it('rejects invalid browser_pointer_action sequences and page conflicts', async () => {
    const pages: MockPageState[] = [
      {
        id: 'page-1',
        title: 'Pointer Failures',
        currentUrl: 'https://example.com/pointer',
        query: {
          '#handle': {
            exists: true,
            connected: true,
            rect: {
              x: 30,
              y: 50,
              width: 40,
              height: 20,
              top: 50,
              right: 70,
              bottom: 70,
              left: 30,
            },
            display: 'block',
            visibility: 'visible',
            opacity: '1',
          },
        },
      },
    ];

    const responses = await runMcpRequests(pages, [
      {
        jsonrpc: '2.0',
        id: 914,
        method: 'tools/call',
        params: {
          name: 'browser_pointer_action',
          arguments: {
            actions: [{ type: 'up' }],
          },
        },
      },
      {
        jsonrpc: '2.0',
        id: 915,
        method: 'tools/call',
        params: {
          name: 'browser_pointer_action',
          arguments: {
            actions: [{ type: 'move', selector: '#missing-handle' }],
          },
        },
      },
      {
        jsonrpc: '2.0',
        id: 919,
        method: 'tools/call',
        params: {
          name: 'browser_pointer_action',
          arguments: {
            pageIndex: 0,
            pageId: 'page-1',
            actions: [{ type: 'move', x: 10, y: 10 }],
          },
        },
      },
    ]);

    expect(getResponseText(responses.find((message) => message.id === 914))).toContain('pointer state error');
    expect(getResponseText(responses.find((message) => message.id === 915))).toContain('drag coordinates unavailable');
    expect(getResponseText(responses.find((message) => message.id === 919))).toContain(
      'pageIndex and pageId cannot be used together'
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
          id: 69,
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

    expect(getResponseText(responses.find((message) => message.id === 69))).toContain(
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
