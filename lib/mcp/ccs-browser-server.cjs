#!/usr/bin/env node

const { WebSocket } = require('ws');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'ccs-browser';
const SERVER_VERSION = '1.0.0';
const TOOL_SESSION_INFO = 'browser_get_session_info';
const TOOL_URL_TITLE = 'browser_get_url_and_title';
const TOOL_VISIBLE_TEXT = 'browser_get_visible_text';
const TOOL_DOM_SNAPSHOT = 'browser_get_dom_snapshot';
const TOOL_NAVIGATE = 'browser_navigate';
const TOOL_CLICK = 'browser_click';
const TOOL_TYPE = 'browser_type';
const TOOL_TAKE_SCREENSHOT = 'browser_take_screenshot';
const TOOL_NAMES = [
  TOOL_SESSION_INFO,
  TOOL_URL_TITLE,
  TOOL_VISIBLE_TEXT,
  TOOL_DOM_SNAPSHOT,
  TOOL_NAVIGATE,
  TOOL_CLICK,
  TOOL_TYPE,
  TOOL_TAKE_SCREENSHOT,
];
const CDP_TIMEOUT_MS = 5000;
const NAVIGATION_POLL_INTERVAL_MS = 100;

let inputBuffer = Buffer.alloc(0);
let requestCounter = 0;

function shouldExposeTools() {
  return Boolean(process.env.CCS_BROWSER_DEVTOOLS_HTTP_URL);
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function writeResponse(id, result) {
  writeMessage({ jsonrpc: '2.0', id, result });
}

function writeError(id, code, message) {
  writeMessage({ jsonrpc: '2.0', id, error: { code, message } });
}

function getTools() {
  if (!shouldExposeTools()) {
    return [];
  }

  return [
    {
      name: TOOL_SESSION_INFO,
      description:
        'List the current Chrome session pages available through the configured DevTools connection, including page ids, titles, URLs, and websocket endpoints.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: TOOL_URL_TITLE,
      description:
        'Read the current page URL and title from the configured Chrome session. Optionally choose a page by index.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description: 'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_VISIBLE_TEXT,
      description:
        'Read visible text from the current page via DOM evaluation in the configured Chrome session. Optionally choose a page by index.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description: 'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_DOM_SNAPSHOT,
      description:
        'Read a DOM snapshot from the current page by returning the document outerHTML. Optionally choose a page by index.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description: 'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_NAVIGATE,
      description:
        'Navigate the selected page to an absolute http or https URL and wait until navigation is ready. Optionally choose a page by index.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description: 'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
          url: {
            type: 'string',
            description: 'Required absolute http or https URL to navigate to.',
          },
        },
        required: ['url'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_CLICK,
      description:
        'Click the first element matching a CSS selector in the selected page using a minimal mouse event chain with click fallback. Optionally choose a page by index.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description: 'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
          selector: {
            type: 'string',
            description: 'Required CSS selector for the element to click.',
          },
        },
        required: ['selector'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_TYPE,
      description:
        'Type text into the first element matching a CSS selector when it is a supported text-editable target. Optionally choose a page by index.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description: 'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
          selector: {
            type: 'string',
            description: 'Required CSS selector for the target element.',
          },
          text: {
            type: 'string',
            description: 'Required text to assign. May be an empty string.',
          },
          clearFirst: {
            type: 'boolean',
            description: 'When true, clear the current value or content before assigning text.',
          },
        },
        required: ['selector', 'text'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_TAKE_SCREENSHOT,
      description:
        'Capture a PNG screenshot from the selected page. Optionally choose a page by index or request fullPage capture.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description: 'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
          fullPage: {
            type: 'boolean',
            description: 'Optional full-page capture flag.',
          },
        },
        additionalProperties: false,
      },
    },
  ];
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return await response.json();
}

function getHttpUrl() {
  const value = process.env.CCS_BROWSER_DEVTOOLS_HTTP_URL;
  if (!value) {
    throw new Error('Browser MCP is unavailable because CCS_BROWSER_DEVTOOLS_HTTP_URL is missing.');
  }
  return value.replace(/\/+$/, '');
}

async function listPageTargets() {
  const targets = await fetchJson(`${getHttpUrl()}/json/list`);
  if (!Array.isArray(targets)) {
    throw new Error('Browser MCP received an invalid /json/list response.');
  }

  return targets
    .filter((target) => target && typeof target === 'object' && target.type === 'page')
    .map((target) => ({
      id: typeof target.id === 'string' ? target.id : '',
      title: typeof target.title === 'string' ? target.title : '',
      url: typeof target.url === 'string' ? target.url : '',
      type: typeof target.type === 'string' ? target.type : 'page',
      webSocketDebuggerUrl:
        typeof target.webSocketDebuggerUrl === 'string' ? target.webSocketDebuggerUrl : '',
    }));
}

function parsePageIndex(toolArgs) {
  if (!toolArgs || !Object.prototype.hasOwnProperty.call(toolArgs, 'pageIndex')) {
    return 0;
  }

  if (!Number.isInteger(toolArgs.pageIndex) || toolArgs.pageIndex < 0) {
    throw new Error('pageIndex must be a non-negative integer');
  }

  return toolArgs.pageIndex;
}

async function getSelectedPage(toolArgs) {
  const pages = await listPageTargets();
  if (pages.length === 0) {
    throw new Error('Browser MCP did not find any page targets in the current Chrome session.');
  }

  const pageIndex = parsePageIndex(toolArgs);

  const page = pages[pageIndex];
  if (!page) {
    throw new Error(`Browser MCP page index ${pageIndex} is out of range (found ${pages.length} pages).`);
  }
  if (!page.webSocketDebuggerUrl) {
    throw new Error(`Browser MCP page ${pageIndex} does not expose a websocket debugger URL.`);
  }

  return { page, pageIndex, pages };
}

function formatSessionInfo(pages) {
  return [
    '[CCS Browser Session]',
    '',
    ...pages.map((page, index) => `${index}. ${page.title || '<untitled>'} | ${page.url || '<empty>'}`),
  ].join('\n');
}

function createEvaluateExpression(kind) {
  switch (kind) {
    case 'url-title':
      return `JSON.stringify({ title: document.title, url: location.href })`;
    case 'visible-text':
      return `document.body ? document.body.innerText : ''`;
    case 'dom-snapshot':
      return `document.documentElement ? document.documentElement.outerHTML : ''`;
    default:
      throw new Error(`Unknown browser evaluation kind: ${kind}`);
  }
}

async function sendCdpCommand(page, method, params = {}) {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const requestId = ++requestCounter;

  return await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.terminate();
        reject(new Error('Browser MCP timed out waiting for a DevTools response.'));
      }
    }, CDP_TIMEOUT_MS);

    function settleError(error) {
      if (settled) {
        return;
      }
      clearTimeout(timer);
      settled = true;
      reject(error);
    }

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          id: requestId,
          method,
          params,
        })
      );
    });

    ws.on('message', (data) => {
      if (settled) {
        return;
      }

      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (message.id !== requestId) {
        return;
      }

      clearTimeout(timer);
      settled = true;
      ws.close();

      if (message.error) {
        reject(new Error(message.error.message || 'DevTools request failed.'));
        return;
      }

      resolve(message.result || null);
    });

    ws.on('error', (error) => {
      settleError(error);
    });

    ws.on('close', () => {
      if (settled) {
        return;
      }
      settleError(new Error('Browser MCP lost the DevTools websocket connection.'));
    });
  });
}

async function evaluateInPage(page, kind) {
  const response = await sendCdpCommand(page, 'Runtime.evaluate', {
    expression: createEvaluateExpression(kind),
    returnByValue: true,
  });

  const result = response && response.result ? response.result : null;
  if (!result) {
    throw new Error('Browser MCP received an invalid DevTools evaluation response.');
  }

  if (result.subtype === 'error') {
    throw new Error(result.description || 'DevTools evaluation returned an error.');
  }

  return typeof result.value === 'string' ? result.value : result.value ?? '';
}

async function evaluateExpression(page, expression) {
  const response = await sendCdpCommand(page, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
  });

  const result = response && response.result ? response.result : null;
  if (!result) {
    throw new Error('Browser MCP received an invalid DevTools evaluation response.');
  }

  if (result.subtype === 'error') {
    throw new Error(result.description || 'DevTools evaluation returned an error.');
  }

  return typeof result.value === 'string' ? result.value : result.value ?? '';
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function requireString(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`${label} is required`);
  }
  return value;
}

function requireValidHttpUrl(value) {
  const raw = requireNonEmptyString(value, 'url');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('url must be an absolute http or https URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('url must be an absolute http or https URL');
  }

  return parsed.toString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getNavigationState(page) {
  const raw = await evaluateExpression(page, `JSON.stringify({ href: location.href, readyState: document.readyState })`);
  const parsed = JSON.parse(raw);
  return {
    href: typeof parsed.href === 'string' ? parsed.href : '',
    readyState: typeof parsed.readyState === 'string' ? parsed.readyState : '',
  };
}

function isSameDocumentHashNavigation(beforeHref, requestedUrl) {
  try {
    const before = new URL(beforeHref);
    const requested = new URL(requestedUrl);
    return (
      before.origin === requested.origin &&
      before.pathname === requested.pathname &&
      before.search === requested.search &&
      before.hash !== requested.hash
    );
  } catch {
    return false;
  }
}

function isNavigationReady(state, beforeHref, requestedUrl) {
  if (state.readyState !== 'interactive' && state.readyState !== 'complete') {
    return false;
  }

  if (state.href === requestedUrl) {
    return true;
  }

  if (state.href && state.href !== beforeHref) {
    return true;
  }

  if (isSameDocumentHashNavigation(beforeHref, requestedUrl) && state.href === requestedUrl) {
    return true;
  }

  return false;
}

async function waitForNavigationReady(page, beforeHref, requestedUrl) {
  const deadline = Date.now() + CDP_TIMEOUT_MS;

  while (Date.now() <= deadline) {
    const state = await getNavigationState(page);
    if (isNavigationReady(state, beforeHref, requestedUrl)) {
      return state.href;
    }
    if (Date.now() + NAVIGATION_POLL_INTERVAL_MS > deadline) {
      break;
    }
    await sleep(NAVIGATION_POLL_INTERVAL_MS);
  }

  throw new Error(`navigation did not complete for URL: ${requestedUrl}`);
}

async function handleNavigate(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const url = requireValidHttpUrl(toolArgs.url);
  const before = await getNavigationState(page);
  const navigateResult = await sendCdpCommand(page, 'Page.navigate', { url });
  if (navigateResult && typeof navigateResult.errorText === 'string' && navigateResult.errorText) {
    throw new Error(`navigation failed for URL: ${url}: ${navigateResult.errorText}`);
  }
  const finalUrl = await waitForNavigationReady(page, before.href, url);
  return `pageIndex: ${pageIndex}\nurl: ${finalUrl}\nstatus: navigated`;
}

async function handleClick(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const selector = requireNonEmptyString(toolArgs.selector, 'selector');

  const expression = `(() => {
    const selector = JSON.parse(${JSON.stringify(JSON.stringify(selector))});
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error('element not found for selector: ' + selector);
    }
    if (!element.isConnected) {
      throw new Error('element is detached for selector: ' + selector);
    }
    if ('disabled' in element && element.disabled) {
      throw new Error('element is disabled for selector: ' + selector);
    }
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      throw new Error('element is hidden or not interactable for selector: ' + selector);
    }
    element.scrollIntoView({ block: 'center', inline: 'center' });

    const dispatchMouseEvent = (type, init) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        detail: 1,
        ...init,
      });
      return element.dispatchEvent(event);
    };

    try {
      const dispatchResult = {
        shouldActivate:
          dispatchMouseEvent('mousedown', { button: 0, buttons: 1 }) &&
          dispatchMouseEvent('mouseup', { button: 0, buttons: 0 }),
      };
      if (!dispatchResult.shouldActivate) {
        return 'ok';
      }
      if (!element.isConnected) {
        return 'ok';
      }
    } catch (mouseError) {
      // Fall through to the native activation path below.
    }

    element.click();

    return 'ok';
  })()`;

  await evaluateExpression(page, expression);
  return `pageIndex: ${pageIndex}\nselector: ${selector}\nstatus: clicked`;
}

async function handleType(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const selector = requireNonEmptyString(toolArgs.selector, 'selector');
  const text = requireString(toolArgs.text, 'text');
  const clearFirst = toolArgs.clearFirst === true;

  const expression = `(() => {
    const selector = JSON.parse(${JSON.stringify(JSON.stringify(selector))});
    const text = JSON.parse(${JSON.stringify(JSON.stringify(text))});
    const clearFirst = ${clearFirst ? 'true' : 'false'};
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error('element not found for selector: ' + selector);
    }

    const dispatchEvents = (target) => {
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const focusTarget = (target) => {
      if (typeof target.focus === 'function') {
        target.focus();
      }
    };

    let readback = '';
    let expectedValue = '';

    if (element instanceof HTMLTextAreaElement) {
      focusTarget(element);
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      expectedValue = (clearFirst ? '' : element.value) + text;
      if (setter) {
        setter.call(element, expectedValue);
      } else {
        element.value = expectedValue;
      }
      dispatchEvents(element);
      readback = element.value;
    } else if (element instanceof HTMLInputElement) {
      const supportedTypes = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password']);
      const normalizedType = (element.getAttribute('type') || '').toLowerCase();
      if (!supportedTypes.has(normalizedType)) {
        throw new Error('element is not text-editable for selector: ' + selector);
      }
      focusTarget(element);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      expectedValue = (clearFirst ? '' : element.value) + text;
      if (setter) {
        setter.call(element, expectedValue);
      } else {
        element.value = expectedValue;
      }
      dispatchEvents(element);
      readback = element.value;
    } else if (element.isContentEditable === true) {
      focusTarget(element);
      expectedValue = (clearFirst ? '' : (element.textContent || '')) + text;
      element.textContent = expectedValue;
      dispatchEvents(element);
      readback = element.textContent || '';
    } else {
      throw new Error('element is not text-editable for selector: ' + selector);
    }

    if (readback !== expectedValue) {
      throw new Error('typed text verification failed for selector: ' + selector);
    }

    return JSON.stringify({ value: readback, typedLength: readback.length });
  })()`;

  const raw = await evaluateExpression(page, expression);
  const parsed = JSON.parse(raw);
  const typedLength = typeof parsed.typedLength === 'number' ? parsed.typedLength : String(parsed.value || '').length;
  return `pageIndex: ${pageIndex}\nselector: ${selector}\ntypedLength: ${typedLength}\nstatus: typed`;
}

async function handleScreenshot(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const fullPage = toolArgs.fullPage === true;
  const response = await sendCdpCommand(page, 'Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: fullPage,
  });

  const data = response && typeof response.data === 'string' ? response.data : '';
  if (!data) {
    throw new Error('screenshot capture failed');
  }

  return `pageIndex: ${pageIndex}\nformat: png\nfullPage: ${fullPage ? 'true' : 'false'}\ndata: ${data}`;
}

async function handleToolCall(message) {
  const id = message.id;
  const params = message.params || {};
  const toolName = params.name || '<missing>';
  const toolArgs = params.arguments || {};

  if (!TOOL_NAMES.includes(toolName)) {
    writeError(id, -32602, `Unknown tool: ${toolName}`);
    return;
  }

  if (!shouldExposeTools()) {
    writeResponse(id, {
      content: [
        {
          type: 'text',
          text: 'Browser MCP is unavailable because browser reuse is not configured for this Claude session.',
        },
      ],
      isError: true,
    });
    return;
  }

  try {
    if (toolName === TOOL_SESSION_INFO) {
      const pages = await listPageTargets();
      writeResponse(id, {
        content: [{ type: 'text', text: formatSessionInfo(pages) }],
      });
      return;
    }

    if (toolName === TOOL_NAVIGATE) {
      const text = await handleNavigate(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_CLICK) {
      const text = await handleClick(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_TYPE) {
      const text = await handleType(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_TAKE_SCREENSHOT) {
      const text = await handleScreenshot(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    const { page, pageIndex } = await getSelectedPage(toolArgs);

    if (toolName === TOOL_URL_TITLE) {
      const raw = await evaluateInPage(page, 'url-title');
      const parsed = JSON.parse(raw);
      writeResponse(id, {
        content: [
          {
            type: 'text',
            text: `pageIndex: ${pageIndex}\ntitle: ${parsed.title || ''}\nurl: ${parsed.url || ''}`,
          },
        ],
      });
      return;
    }

    if (toolName === TOOL_VISIBLE_TEXT) {
      const text = await evaluateInPage(page, 'visible-text');
      writeResponse(id, {
        content: [{ type: 'text', text: text || '' }],
      });
      return;
    }

    const html = await evaluateInPage(page, 'dom-snapshot');
    writeResponse(id, {
      content: [{ type: 'text', text: html || '' }],
    });
  } catch (error) {
    writeResponse(id, {
      content: [
        {
          type: 'text',
          text: `Browser MCP failed: ${(error && error.message) || String(error)}`,
        },
      ],
      isError: true,
    });
  }
}

async function handleMessage(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return;
  }

  switch (message.method) {
    case 'initialize':
      writeResponse(message.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
      return;
    case 'notifications/initialized':
      return;
    case 'ping':
      writeResponse(message.id, {});
      return;
    case 'tools/list':
      writeResponse(message.id, { tools: getTools() });
      return;
    case 'tools/call':
      await handleToolCall(message);
      return;
    default:
      if (message.id !== undefined) {
        writeError(message.id, -32601, `Method not found: ${message.method}`);
      }
  }
}

function parseMessages() {
  while (true) {
    let body;
    const startsWithLegacyHeaders = inputBuffer
      .subarray(0, Math.min(inputBuffer.length, 32))
      .toString('utf8')
      .toLowerCase()
      .startsWith('content-length:');

    if (startsWithLegacyHeaders) {
      const headerEnd = inputBuffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        return;
      }

      const headerText = inputBuffer.subarray(0, headerEnd).toString('utf8');
      const match = headerText.match(/content-length:\s*(\d+)/i);
      if (!match) {
        inputBuffer = Buffer.alloc(0);
        return;
      }

      const contentLength = Number.parseInt(match[1], 10);
      const messageEnd = headerEnd + 4 + contentLength;
      if (inputBuffer.length < messageEnd) {
        return;
      }

      body = inputBuffer.subarray(headerEnd + 4, messageEnd).toString('utf8');
      inputBuffer = inputBuffer.subarray(messageEnd);
    } else {
      const newlineIndex = inputBuffer.indexOf('\n');
      if (newlineIndex === -1) {
        return;
      }

      body = inputBuffer.subarray(0, newlineIndex).toString('utf8').replace(/\r$/, '').trim();
      inputBuffer = inputBuffer.subarray(newlineIndex + 1);
      if (!body) {
        continue;
      }
    }

    let message;
    try {
      message = JSON.parse(body);
    } catch {
      continue;
    }

    Promise.resolve(handleMessage(message)).catch((error) => {
      if (message && message.id !== undefined) {
        writeError(message.id, -32603, (error && error.message) || 'Internal error');
      }
    });
  }
}

process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  parseMessages();
});

process.stdin.on('error', () => {
  process.exit(0);
});

['SIGINT', 'SIGTERM', 'SIGHUP'].forEach((signal) => {
  process.on(signal, () => process.exit(0));
});

process.stdin.resume();
