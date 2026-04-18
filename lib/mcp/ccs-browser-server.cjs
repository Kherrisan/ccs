#!/usr/bin/env node

function loadWebSocketImplementation() {
  if (typeof globalThis.WebSocket === 'function') {
    return globalThis.WebSocket;
  }

  try {
    const { WebSocket } = require('undici');
    if (typeof WebSocket === 'function') {
      return WebSocket;
    }
  } catch {
    // Fall through to the legacy ws dependency when available.
  }

  try {
    const wsModule = require('ws');
    if (typeof wsModule === 'function') {
      return wsModule;
    }
    if (typeof wsModule?.WebSocket === 'function') {
      return wsModule.WebSocket;
    }
  } catch {
    // Surface a dedicated error below if no implementation is available.
  }

  throw new Error(
    'Browser MCP could not find a WebSocket implementation. Tried globalThis.WebSocket, undici, and ws.'
  );
}

const WebSocket = loadWebSocketImplementation();

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
const TOOL_PRESS_KEY = 'browser_press_key';
const TOOL_SCROLL = 'browser_scroll';
const TOOL_TAKE_SCREENSHOT = 'browser_take_screenshot';
const TOOL_WAIT_FOR = 'browser_wait_for';
const TOOL_EVAL = 'browser_eval';
const TOOL_HOVER = 'browser_hover';
const TOOL_QUERY = 'browser_query';
const TOOL_TAKE_ELEMENT_SCREENSHOT = 'browser_take_element_screenshot';
const TOOL_WAIT_FOR_EVENT = 'browser_wait_for_event';
const TOOL_NAMES = [
  TOOL_SESSION_INFO,
  TOOL_URL_TITLE,
  TOOL_VISIBLE_TEXT,
  TOOL_DOM_SNAPSHOT,
  TOOL_NAVIGATE,
  TOOL_CLICK,
  TOOL_TYPE,
  TOOL_PRESS_KEY,
  TOOL_SCROLL,
  TOOL_TAKE_SCREENSHOT,
  TOOL_WAIT_FOR,
  TOOL_EVAL,
  TOOL_HOVER,
  TOOL_QUERY,
  TOOL_TAKE_ELEMENT_SCREENSHOT,
  TOOL_WAIT_FOR_EVENT,
];
const SUPPORTED_QUERY_FIELDS = [
  'exists',
  'count',
  'innerText',
  'textContent',
  'boundingClientRect',
  'display',
  'visibility',
  'opacity',
  'href',
  'onclick',
];
const DEFAULT_QUERY_FIELDS = [...SUPPORTED_QUERY_FIELDS];
const SUPPORTED_QUERY_FIELD_SET = new Set(SUPPORTED_QUERY_FIELDS);
const CDP_TIMEOUT_MS = 5000;
const NAVIGATION_POLL_INTERVAL_MS = 100;
const DEFAULT_WAIT_TIMEOUT_MS = 2000;
const DEFAULT_WAIT_POLL_INTERVAL_MS = 100;

let inputBuffer = Buffer.alloc(0);
let requestCounter = 0;

function addSocketListener(socket, eventName, handler) {
  if (typeof socket.addEventListener === 'function') {
    socket.addEventListener(eventName, handler);
    return;
  }

  if (typeof socket.on === 'function') {
    socket.on(eventName, handler);
  }
}

async function getSocketMessageText(message) {
  const data = message && typeof message === 'object' && 'data' in message ? message.data : message;

  if (typeof data === 'string') {
    return data;
  }

  if (Buffer.isBuffer(data)) {
    return data.toString('utf8');
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  }

  if (data && typeof data.text === 'function') {
    return await data.text();
  }

  return String(data);
}

function closeSocket(socket) {
  if (typeof socket.close === 'function') {
    socket.close();
  }
}

function abortSocket(socket) {
  if (typeof socket.terminate === 'function') {
    socket.terminate();
    return;
  }

  closeSocket(socket);
}

function toSocketError(error) {
  if (error instanceof Error) {
    return error;
  }

  return new Error('Browser MCP lost the DevTools websocket connection.');
}

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
        'Click the first element matching a CSS selector in the selected page using a minimal mouse event chain with click fallback. Optionally choose a page by index and match index.',
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
          nth: {
            type: 'integer',
            minimum: 0,
            description: 'Optional zero-based match index for selectors returning multiple elements.',
          },
          frameSelector: {
            type: 'string',
            description: 'Optional CSS selector for an iframe whose document should be used as the query root.',
          },
          pierceShadow: {
            type: 'boolean',
            description: 'When true, search open shadow roots beneath the selected root.',
          },
          offsetX: {
            type: 'number',
            description: "Optional horizontal offset in CSS pixels from the target element's left edge.",
          },
          offsetY: {
            type: 'number',
            description: "Optional vertical offset in CSS pixels from the target element's top edge.",
          },
          button: {
            type: 'string',
            enum: ['left', 'middle', 'right'],
            description: 'Optional mouse button. Defaults to left.',
          },
          clickCount: {
            type: 'integer',
            minimum: 1,
            description: 'Optional click count. Defaults to 1.',
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
      name: TOOL_PRESS_KEY,
      description:
        'Press a key or key combination in the selected page using real keyboard-style events. Optionally choose a page by index.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description: 'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
          key: {
            type: 'string',
            description: 'Required primary key to press.',
          },
          modifiers: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['Alt', 'Control', 'Meta', 'Shift'],
            },
            description: 'Optional modifier keys such as Alt, Control, Meta, or Shift.',
          },
          repeat: {
            type: 'integer',
            minimum: 1,
            description: 'Optional repeat count. Defaults to 1.',
          },
        },
        required: ['key'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_SCROLL,
      description:
        'Scroll the selected page or a matched element. Supports explicit deltas or scrolling an element into view.',
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
            description: 'Optional CSS selector for an element-scoped scroll target.',
          },
          frameSelector: {
            type: 'string',
            description: 'Optional CSS selector for an iframe whose document should be used as the query root.',
          },
          pierceShadow: {
            type: 'boolean',
            description: 'When true, search open shadow roots beneath the selected root.',
          },
          behavior: {
            type: 'string',
            enum: ['into-view', 'by-offset'],
            description: 'Required scroll behavior.',
          },
          deltaX: {
            type: 'number',
            description: 'Optional horizontal scroll delta for by-offset behavior.',
          },
          deltaY: {
            type: 'number',
            description: 'Optional vertical scroll delta for by-offset behavior.',
          },
        },
        required: ['behavior'],
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
    {
      name: TOOL_WAIT_FOR,
      description:
        'Poll until a selector-scoped or page-level condition is satisfied. Supports selector existence/visibility/text waits and page text waits.',
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
            description: 'Optional CSS selector for selector-scoped waiting.',
          },
          nth: {
            type: 'integer',
            minimum: 0,
            description: 'Optional zero-based match index for selectors returning multiple elements.',
          },
          frameSelector: {
            type: 'string',
            description: 'Optional CSS selector for an iframe whose document should be used as the query root.',
          },
          pierceShadow: {
            type: 'boolean',
            description: 'When true, search open shadow roots beneath the selected root.',
          },
          timeoutMs: {
            type: 'integer',
            minimum: 1,
            description: 'Optional timeout in milliseconds.',
          },
          pollIntervalMs: {
            type: 'integer',
            minimum: 1,
            description: 'Optional polling interval in milliseconds.',
          },
          condition: {
            type: 'object',
            description: 'Required wait condition.',
          },
        },
        required: ['condition'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_EVAL,
      description:
        'Evaluate page-side JavaScript for inspection or mutation, gated by CCS_BROWSER_EVAL_MODE.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description: 'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
          expression: {
            type: 'string',
            description: 'Required JavaScript expression to evaluate in the page.',
          },
          mode: {
            type: 'string',
            enum: ['readonly', 'readwrite'],
            description: 'Optional evaluation mode. Defaults to readonly.',
          },
        },
        required: ['expression'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_HOVER,
      description:
        'Move the browser mouse pointer onto the first element matching a CSS selector in the selected page to trigger hover state. Optionally choose a page by index.',
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
            description: 'Required CSS selector for the hover target.',
          },
          frameSelector: {
            type: 'string',
            description: 'Optional CSS selector for an iframe whose document should be used as the query root.',
          },
          pierceShadow: {
            type: 'boolean',
            description: 'When true, search open shadow roots beneath the selected root.',
          },
        },
        required: ['selector'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_QUERY,
      description:
        'Return diagnostic state for selector-matched elements in the selected page. Optionally choose a page by index, zero-based match index, and a subset of fields.',
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
            description: 'Required CSS selector for the query target.',
          },
          nth: {
            type: 'integer',
            minimum: 0,
            description: 'Optional zero-based match index for selectors returning multiple elements.',
          },
          frameSelector: {
            type: 'string',
            description: 'Optional CSS selector for an iframe whose document should be used as the query root.',
          },
          pierceShadow: {
            type: 'boolean',
            description: 'When true, search open shadow roots beneath the selected root.',
          },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional list of diagnostic fields to return.',
          },
        },
        required: ['selector'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_TAKE_ELEMENT_SCREENSHOT,
      description:
        'Capture a PNG screenshot clipped to the first element matching a CSS selector in the selected page. Optionally choose a page by index.',
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
            description: 'Required CSS selector for the screenshot target.',
          },
          frameSelector: {
            type: 'string',
            description: 'Optional CSS selector for an iframe whose document should be used as the query root.',
          },
          pierceShadow: {
            type: 'boolean',
            description: 'When true, search open shadow roots beneath the selected root.',
          },
        },
        required: ['selector'],
        additionalProperties: false,
      },
    },
    {
      name: TOOL_WAIT_FOR_EVENT,
      description: 'Wait until a page or browser event matching the requested filter is observed.',
      inputSchema: {
        type: 'object',
        properties: {
          pageIndex: {
            type: 'integer',
            minimum: 0,
            description: 'Optional zero-based page index from browser_get_session_info. Defaults to the first page.',
          },
          timeoutMs: {
            type: 'integer',
            minimum: 1,
            description: 'Optional timeout in milliseconds.',
          },
          event: {
            type: 'object',
            description: 'Required event selector.',
          },
        },
        required: ['event'],
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
        abortSocket(ws);
        reject(new Error('Browser MCP timed out waiting for a DevTools response.'));
      }
    }, CDP_TIMEOUT_MS);

    function settleError(error) {
      if (settled) {
        return;
      }
      clearTimeout(timer);
      settled = true;
      reject(toSocketError(error));
    }

    addSocketListener(ws, 'open', () => {
      ws.send(
        JSON.stringify({
          id: requestId,
          method,
          params,
        })
      );
    });

    addSocketListener(ws, 'message', (data) => {
      void (async () => {
        const raw = await getSocketMessageText(data);

        if (settled) {
          return;
        }

        let message;
        try {
          message = JSON.parse(raw);
        } catch {
          return;
        }

        if (message.id !== requestId) {
          return;
        }

        clearTimeout(timer);
        settled = true;
        closeSocket(ws);

        if (message.error) {
          reject(new Error(message.error.message || 'DevTools request failed.'));
          return;
        }

        resolve(message.result || null);
      })().catch(settleError);
    });

    addSocketListener(ws, 'error', (error) => {
      settleError(error);
    });

    addSocketListener(ws, 'close', () => {
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

function parseQueryFields(value) {
  if (value === undefined) {
    return DEFAULT_QUERY_FIELDS;
  }
  if (!Array.isArray(value) || value.some((field) => typeof field !== 'string')) {
    throw new Error('fields must be an array of strings');
  }
  const unknownField = value.find((field) => !SUPPORTED_QUERY_FIELD_SET.has(field));
  if (unknownField) {
    throw new Error(`unknown query field: ${unknownField}`);
  }
  return value;
}

function requireOptionalNonNegativeInteger(value, label) {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function requirePositiveIntegerOrDefault(value, label, fallback) {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function requireFiniteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function requireEnumString(value, label, allowedValues) {
  if (value === undefined) {
    return undefined;
  }
  const normalized = requireNonEmptyString(value, label);
  if (!allowedValues.includes(normalized)) {
    throw new Error(`${label} must be one of: ${allowedValues.join(', ')}`);
  }
  return normalized;
}

function requireOptionalStringArray(value, label, allowedValues) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  const normalized = value.map((item) => item.trim());
  if (Array.isArray(allowedValues) && allowedValues.length > 0) {
    for (const item of normalized) {
      if (!allowedValues.includes(item)) {
        throw new Error(`${label} must only contain: ${allowedValues.join(', ')}`);
      }
    }
  }
  return normalized;
}

function getBrowserEvalMode() {
  const raw = String(process.env.CCS_BROWSER_EVAL_MODE || 'readonly').trim();
  if (raw === 'disabled' || raw === 'readonly' || raw === 'readwrite') {
    return raw;
  }
  return 'readonly';
}

function parseOptionalNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : '';
}

function formatScopedSelectorSuffix(frameSelector, pierceShadow) {
  return `${frameSelector ? `\nframeSelector: ${frameSelector}` : ''}${pierceShadow ? '\npierceShadow: true' : ''}`;
}

function buildScopedMatchesExpression(selector, nth, frameSelector, pierceShadow) {
  return `(() => {
    const selector = JSON.parse(${JSON.stringify(JSON.stringify(selector))});
    const nth = ${nth === undefined ? 'undefined' : String(nth)};
    const frameSelector = ${frameSelector ? `JSON.parse(${JSON.stringify(JSON.stringify(frameSelector))})` : 'undefined'};
    const pierceShadow = ${pierceShadow ? 'true' : 'false'};

    const visitRoots = (root) => {
      const roots = [root];
      if (!pierceShadow) {
        return roots;
      }
      const queue = [root];
      while (queue.length > 0) {
        const current = queue.shift();
        const elements = Array.from(current.querySelectorAll('*'));
        for (const element of elements) {
          if (element.shadowRoot) {
            roots.push(element.shadowRoot);
            queue.push(element.shadowRoot);
          }
        }
      }
      return roots;
    };

    let root = document;
    if (frameSelector) {
      const frame = document.querySelector(frameSelector);
      if (!frame) {
        throw new Error('frame not found for selector: ' + frameSelector);
      }
      const frameDocument = frame.contentDocument;
      if (!frameDocument) {
        throw new Error('frame document is unavailable for selector: ' + frameSelector);
      }
      root = frameDocument;
    }

    const roots = visitRoots(root);
    const matches = [];
    for (const currentRoot of roots) {
      matches.push(...Array.from(currentRoot.querySelectorAll(selector)));
    }

    const count = matches.length;
    const targetIndex = nth ?? 0;
    const element = matches[targetIndex];
    if (!element) {
      return JSON.stringify({
        exists: nth === undefined ? count > 0 : count > targetIndex,
        count,
        targetIndex,
        targetMissing: true,
      });
    }

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const text = typeof element.innerText === 'string' ? element.innerText : (element.textContent || '');
    return JSON.stringify({
      exists: true,
      count,
      targetIndex,
      connected: element.isConnected,
      text,
      innerText: typeof element.innerText === 'string' ? element.innerText : '',
      textContent: element.textContent || '',
      boundingClientRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      },
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      href: typeof element.getAttribute === 'function' ? element.getAttribute('href') || '' : '',
      onclick: typeof element.getAttribute === 'function' ? element.getAttribute('onclick') || '' : '',
      interactable:
        element.isConnected &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0,
      centerPoint: {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      },
    });
  })()`;
}

async function getScopedDiagnostics(page, selector, nth, frameSelector, pierceShadow) {
  const raw = await evaluateExpression(page, buildScopedMatchesExpression(selector, nth, frameSelector, pierceShadow));
  return JSON.parse(raw);
}

function parseEventCondition(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('event is required');
  }
  if (value.kind === 'dialog') {
    return {
      kind: 'dialog',
      dialogType: value.dialogType ? String(value.dialogType) : undefined,
      messageIncludes: value.messageIncludes ? String(value.messageIncludes) : undefined,
    };
  }
  if (value.kind === 'navigation') {
    return {
      kind: 'navigation',
      urlIncludes: value.urlIncludes ? String(value.urlIncludes) : undefined,
    };
  }
  if (value.kind === 'request') {
    return {
      kind: 'request',
      urlIncludes: value.urlIncludes ? String(value.urlIncludes) : undefined,
      method: value.method ? String(value.method) : undefined,
    };
  }
  if (value.kind === 'download') {
    return {
      kind: 'download',
      urlIncludes: value.urlIncludes ? String(value.urlIncludes) : undefined,
      suggestedFilenameIncludes: value.suggestedFilenameIncludes
        ? String(value.suggestedFilenameIncludes)
        : undefined,
    };
  }
  throw new Error(`unknown event kind: ${String(value.kind || '')}`);
}

function matchesObservedEvent(event, observed) {
  if (event.kind === 'dialog') {
    return (
      (!event.dialogType || observed.type === event.dialogType) &&
      (!event.messageIncludes || String(observed.message || '').includes(event.messageIncludes))
    );
  }
  if (event.kind === 'navigation') {
    return !event.urlIncludes || String(observed.url || '').includes(event.urlIncludes);
  }
  if (event.kind === 'request') {
    return (
      (!event.urlIncludes || String(observed.url || '').includes(event.urlIncludes)) &&
      (!event.method || String(observed.method || '').toUpperCase() === event.method.toUpperCase())
    );
  }
  if (event.kind === 'download') {
    return (
      (!event.urlIncludes || String(observed.url || '').includes(event.urlIncludes)) &&
      (!event.suggestedFilenameIncludes || String(observed.suggestedFilename || '').includes(event.suggestedFilenameIncludes))
    );
  }
  return false;
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
  const nth = requireOptionalNonNegativeInteger(toolArgs.nth, 'nth');
  const targetIndex = nth ?? 0;
  const frameSelector = parseOptionalNonEmptyString(toolArgs.frameSelector);
  const pierceShadow = toolArgs.pierceShadow === true;
  const offsetX = toolArgs.offsetX === undefined ? undefined : requireFiniteNumber(toolArgs.offsetX, 'offsetX');
  const offsetY = toolArgs.offsetY === undefined ? undefined : requireFiniteNumber(toolArgs.offsetY, 'offsetY');
  const button = requireEnumString(toolArgs.button, 'button', ['left', 'middle', 'right']) || 'left';
  const clickCount = toolArgs.clickCount === undefined ? 1 : requirePositiveInteger(toolArgs.clickCount, 'clickCount');

  const expression = `(() => {
    const selector = JSON.parse(${JSON.stringify(JSON.stringify(selector))});
    const nth = ${nth === undefined ? 'undefined' : String(nth)};
    const frameSelector = ${frameSelector ? `JSON.parse(${JSON.stringify(JSON.stringify(frameSelector))})` : 'undefined'};
    const pierceShadow = ${pierceShadow ? 'true' : 'false'};
    const offsetX = ${offsetX === undefined ? 'undefined' : String(offsetX)};
    const offsetY = ${offsetY === undefined ? 'undefined' : String(offsetY)};
    const button = JSON.parse(${JSON.stringify(JSON.stringify(button))});
    const clickCount = ${clickCount};

    const visitRoots = (root) => {
      const roots = [root];
      if (!pierceShadow) {
        return roots;
      }
      const queue = [root];
      while (queue.length > 0) {
        const current = queue.shift();
        const elements = Array.from(current.querySelectorAll('*'));
        for (const element of elements) {
          if (element.shadowRoot) {
            roots.push(element.shadowRoot);
            queue.push(element.shadowRoot);
          }
        }
      }
      return roots;
    };

    let root = document;
    if (frameSelector) {
      const frame = document.querySelector(frameSelector);
      if (!frame) {
        throw new Error('frame not found for selector: ' + frameSelector);
      }
      const frameDocument = frame.contentDocument;
      if (!frameDocument) {
        throw new Error('frame document is unavailable for selector: ' + frameSelector);
      }
      root = frameDocument;
    }

    const roots = visitRoots(root);
    const matches = [];
    for (const currentRoot of roots) {
      matches.push(...Array.from(currentRoot.querySelectorAll(selector)));
    }
    const element = matches[nth ?? 0];
    if (!element) {
      throw new Error('element index ' + (nth ?? 0) + ' is out of range for selector: ' + selector);
    }
    if (!element.isConnected) {
      throw new Error('element is detached for selector: ' + selector);
    }
    if ('disabled' in element && element.disabled) {
      throw new Error('element is disabled for selector: ' + selector);
    }
    const style = window.getComputedStyle(element);
    const initialRect = element.getBoundingClientRect();
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      initialRect.width <= 0 ||
      initialRect.height <= 0
    ) {
      throw new Error('element is hidden or not interactable for selector: ' + selector);
    }
    element.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = element.getBoundingClientRect();

    const resolvedOffsetX = offsetX === undefined ? rect.width / 2 : offsetX;
    const resolvedOffsetY = offsetY === undefined ? rect.height / 2 : offsetY;
    const clientX = rect.left + resolvedOffsetX;
    const clientY = rect.top + resolvedOffsetY;
    const buttonCode = button === 'middle' ? 1 : button === 'right' ? 2 : 0;
    const buttonsMask = buttonCode === 1 ? 4 : buttonCode === 2 ? 2 : 1;

    const dispatchMouseEvent = (type, detail, init) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        detail,
        clientX,
        clientY,
        button: buttonCode,
        buttons: type === 'mousedown' ? buttonsMask : 0,
        ...init,
      });
      return element.dispatchEvent(event);
    };

    try {
      for (let index = 1; index <= clickCount; index += 1) {
        const dispatchResult = {
          shouldActivate:
            dispatchMouseEvent('mousedown', index, {}) &&
            dispatchMouseEvent('mouseup', index, {}),
        };
        if (!dispatchResult.shouldActivate) {
          return JSON.stringify({ resolvedOffsetX, resolvedOffsetY, button, clickCount });
        }
        if (!element.isConnected) {
          return JSON.stringify({ resolvedOffsetX, resolvedOffsetY, button, clickCount });
        }
        if (button === 'left') {
          element.click();
        } else if (button === 'right') {
          element.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            detail: index,
            clientX,
            clientY,
            button: 2,
            buttons: 0,
          }));
        } else {
          element.dispatchEvent(new MouseEvent('auxclick', {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            detail: index,
            clientX,
            clientY,
            button: 1,
            buttons: 0,
          }));
        }
      }
      if (button === 'left' && clickCount === 2) {
        element.dispatchEvent(new MouseEvent('dblclick', {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          detail: 2,
          clientX,
          clientY,
          button: 0,
          buttons: 0,
        }));
      }
    } catch (mouseError) {
    }

    return JSON.stringify({ resolvedOffsetX, resolvedOffsetY, button, clickCount });
  })()`;

  const raw = await evaluateExpression(page, expression);
  const parsed = JSON.parse(raw);
  return `pageIndex: ${pageIndex}\nselector: ${selector}\nnth: ${targetIndex}\noffsetX: ${parsed.resolvedOffsetX}\noffsetY: ${parsed.resolvedOffsetY}\nbutton: ${parsed.button}\nclickCount: ${parsed.clickCount}${formatScopedSelectorSuffix(frameSelector, pierceShadow)}\nstatus: clicked`;
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

async function handlePressKey(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const key = requireNonEmptyString(toolArgs.key, 'key');
  const modifiers = requireOptionalStringArray(toolArgs.modifiers, 'modifiers', [
    'Alt',
    'Control',
    'Meta',
    'Shift',
  ]);
  const repeat = toolArgs.repeat === undefined ? 1 : requirePositiveInteger(toolArgs.repeat, 'repeat');
  const modifierMask =
    (modifiers.includes('Alt') ? 1 : 0) |
    (modifiers.includes('Control') ? 2 : 0) |
    (modifiers.includes('Meta') ? 4 : 0) |
    (modifiers.includes('Shift') ? 8 : 0);
  const specialKeyMap = {
    Enter: { code: 'Enter', keyCode: 13, text: '\r' },
    Tab: { code: 'Tab', keyCode: 9, text: '' },
    Escape: { code: 'Escape', keyCode: 27, text: '' },
    ArrowUp: { code: 'ArrowUp', keyCode: 38, text: '' },
    ArrowDown: { code: 'ArrowDown', keyCode: 40, text: '' },
    ArrowLeft: { code: 'ArrowLeft', keyCode: 37, text: '' },
    ArrowRight: { code: 'ArrowRight', keyCode: 39, text: '' },
    Backspace: { code: 'Backspace', keyCode: 8, text: '' },
    Delete: { code: 'Delete', keyCode: 46, text: '' },
    Space: { code: 'Space', keyCode: 32, text: ' ' },
  };
  const keyDescriptor =
    key.length === 1
      ? {
          code: `Key${key.toUpperCase()}`,
          keyCode: key.toUpperCase().charCodeAt(0),
          text: key,
        }
      : specialKeyMap[key];
  if (!keyDescriptor) {
    throw new Error(`unsupported key: ${key}`);
  }
  const normalizedKey = key;
  const normalizedText = keyDescriptor.text;
  const code = keyDescriptor.code;
  const keyCode = keyDescriptor.keyCode;

  for (let index = 0; index < repeat; index += 1) {
    await sendCdpCommand(page, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: normalizedKey,
      code,
      text: normalizedText,
      unmodifiedText: normalizedText,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
      modifiers: modifierMask,
      autoRepeat: index > 0,
    });
    await sendCdpCommand(page, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: normalizedKey,
      code,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
      modifiers: modifierMask,
    });
  }

  const modifierText = modifiers.length > 0 ? modifiers.join(',') : 'none';
  return `pageIndex: ${pageIndex}\nkey: ${key}\nmodifiers: ${modifierText}\nrepeat: ${repeat}\nstatus: key-pressed`;
}

async function handleScroll(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const selector = parseOptionalNonEmptyString(toolArgs.selector);
  const frameSelector = parseOptionalNonEmptyString(toolArgs.frameSelector);
  const pierceShadow = toolArgs.pierceShadow === true;
  const behavior = requireEnumString(toolArgs.behavior, 'behavior', ['into-view', 'by-offset']);
  const deltaX = toolArgs.deltaX === undefined ? 0 : requireFiniteNumber(toolArgs.deltaX, 'deltaX');
  const deltaY = toolArgs.deltaY === undefined ? 0 : requireFiniteNumber(toolArgs.deltaY, 'deltaY');

  const expression = `(() => {
    const selector = ${selector ? `JSON.parse(${JSON.stringify(JSON.stringify(selector))})` : 'undefined'};
    const frameSelector = ${frameSelector ? `JSON.parse(${JSON.stringify(JSON.stringify(frameSelector))})` : 'undefined'};
    const pierceShadow = ${pierceShadow ? 'true' : 'false'};
    const behavior = JSON.parse(${JSON.stringify(JSON.stringify(behavior))});
    const deltaX = ${deltaX};
    const deltaY = ${deltaY};

    const visitRoots = (root) => {
      const roots = [root];
      if (!pierceShadow) {
        return roots;
      }
      const queue = [root];
      while (queue.length > 0) {
        const current = queue.shift();
        const elements = Array.from(current.querySelectorAll('*'));
        for (const element of elements) {
          if (element.shadowRoot) {
            roots.push(element.shadowRoot);
            queue.push(element.shadowRoot);
          }
        }
      }
      return roots;
    };

    let root = document;
    let scrollWindow = window;
    if (frameSelector) {
      const frame = document.querySelector(frameSelector);
      if (!frame) {
        throw new Error('frame not found for selector: ' + frameSelector);
      }
      const frameDocument = frame.contentDocument;
      if (!frameDocument) {
        throw new Error('frame document is unavailable for selector: ' + frameSelector);
      }
      if (!frame.contentWindow) {
        throw new Error('frame window is unavailable for selector: ' + frameSelector);
      }
      root = frameDocument;
      scrollWindow = frame.contentWindow;
    }

    if (!selector) {
      if (behavior !== 'by-offset') {
        throw new Error('selector is required for behavior: ' + behavior);
      }
      scrollWindow.scrollBy(deltaX, deltaY);
      return JSON.stringify({ scope: 'page', behavior, deltaX, deltaY });
    }

    const roots = visitRoots(root);
    const matches = [];
    for (const currentRoot of roots) {
      matches.push(...Array.from(currentRoot.querySelectorAll(selector)));
    }
    const element = matches[0];
    if (!element) {
      throw new Error('element not found for selector: ' + selector);
    }

    if (behavior === 'into-view') {
      element.scrollIntoView({ block: 'center', inline: 'center' });
      return JSON.stringify({ scope: 'element', selector, behavior });
    }

    if (typeof element.scrollBy === 'function') {
      element.scrollBy(deltaX, deltaY);
      return JSON.stringify({ scope: 'element', selector, behavior, deltaX, deltaY });
    }

    throw new Error('element does not support scrollBy for selector: ' + selector);
  })()`;

  const raw = await evaluateExpression(page, expression);
  const parsed = JSON.parse(raw);
  const lines = [`pageIndex: ${pageIndex}`];
  if (parsed.selector) {
    lines.push(`selector: ${parsed.selector}`);
  }
  lines.push(`behavior: ${parsed.behavior}`);
  if (typeof parsed.deltaX === 'number') {
    lines.push(`deltaX: ${parsed.deltaX}`);
  }
  if (typeof parsed.deltaY === 'number') {
    lines.push(`deltaY: ${parsed.deltaY}`);
  }
  if (parsed.scope === 'element') {
    const scopedSuffix = formatScopedSelectorSuffix(frameSelector, pierceShadow);
    if (scopedSuffix) {
      lines.push(scopedSuffix.slice(1));
    }
  }
  lines.push('status: scrolled');
  return lines.join('\n');
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

async function getElementDiagnostics(page, selector, nth, frameSelector = '', pierceShadow = false) {
  return await getScopedDiagnostics(page, selector, nth, frameSelector, pierceShadow);
}

async function getScrolledElementState(page, selector, frameSelector = '', pierceShadow = false) {
  const expression = `(() => {
    const selector = JSON.parse(${JSON.stringify(JSON.stringify(selector))});
    const frameSelector = ${frameSelector ? `JSON.parse(${JSON.stringify(JSON.stringify(frameSelector))})` : 'undefined'};
    const pierceShadow = ${pierceShadow ? 'true' : 'false'};

    const visitRoots = (root) => {
      const roots = [root];
      if (!pierceShadow) {
        return roots;
      }
      const queue = [root];
      while (queue.length > 0) {
        const current = queue.shift();
        const elements = Array.from(current.querySelectorAll('*'));
        for (const element of elements) {
          if (element.shadowRoot) {
            roots.push(element.shadowRoot);
            queue.push(element.shadowRoot);
          }
        }
      }
      return roots;
    };

    let root = document;
    let frameOffset = { left: 0, top: 0 };
    if (frameSelector) {
      const frame = document.querySelector(frameSelector);
      if (!frame) {
        throw new Error('frame not found for selector: ' + frameSelector);
      }
      const frameDocument = frame.contentDocument;
      if (!frameDocument) {
        throw new Error('frame document is unavailable for selector: ' + frameSelector);
      }
      const frameRect = frame.getBoundingClientRect();
      frameOffset = { left: frameRect.left, top: frameRect.top };
      root = frameDocument;
    }

    const roots = visitRoots(root);
    const matches = [];
    for (const currentRoot of roots) {
      matches.push(...Array.from(currentRoot.querySelectorAll(selector)));
    }
    const element = matches[0];
    if (!element) {
      return JSON.stringify({ exists: false });
    }
    if (!element.isConnected) {
      return JSON.stringify({ exists: true, connected: false });
    }
    element.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = element.getBoundingClientRect();
    const absoluteRect = {
      x: rect.x + frameOffset.left,
      y: rect.y + frameOffset.top,
      width: rect.width,
      height: rect.height,
      top: rect.top + frameOffset.top,
      right: rect.right + frameOffset.left,
      bottom: rect.bottom + frameOffset.top,
      left: rect.left + frameOffset.left,
    };
    const style = window.getComputedStyle(element);
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const clipX = Math.max(0, absoluteRect.left);
    const clipY = Math.max(0, absoluteRect.top);
    const clipRight = Math.min(viewportWidth, absoluteRect.right);
    const clipBottom = Math.min(viewportHeight, absoluteRect.bottom);
    return JSON.stringify({
      exists: true,
      connected: true,
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      interactable:
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0,
      boundingClientRect: absoluteRect,
      centerPoint: {
        x: absoluteRect.left + absoluteRect.width / 2,
        y: absoluteRect.top + absoluteRect.height / 2,
      },
      visibleClip: {
        x: clipX,
        y: clipY,
        width: Math.max(0, clipRight - clipX),
        height: Math.max(0, clipBottom - clipY),
        scale: 1,
      },
    });
  })()`;
  return JSON.parse(await evaluateExpression(page, expression));
}

function formatQueryValue(field, value) {
  if (field === 'boundingClientRect') {
    return JSON.stringify(value);
  }
  return String(value);
}

function hasTargetSpecificQueryField(fields) {
  return fields.some((field) => field !== 'exists' && field !== 'count');
}

function parseWaitCondition(value, hasSelector) {
  if (!value || typeof value !== 'object') {
    throw new Error('condition is required');
  }
  const condition = value;
  if (condition.kind === 'existence') {
    if (!hasSelector) {
      throw new Error('page-level wait only supports text conditions in Phase 1');
    }
    return { kind: 'existence', exists: condition.exists !== false };
  }
  if (condition.kind === 'visibility') {
    if (!hasSelector) {
      throw new Error('page-level wait only supports text conditions in Phase 1');
    }
    return {
      kind: 'visibility',
      visibility: condition.visibility === 'hidden' ? 'hidden' : 'visible',
      opacityGt: typeof condition.opacityGt === 'number' ? condition.opacityGt : undefined,
    };
  }
  if (condition.kind === 'text') {
    if (typeof condition.includes !== 'string' || condition.includes === '') {
      throw new Error('condition.includes is required');
    }
    return { kind: 'text', includes: condition.includes };
  }
  throw new Error(`unknown wait condition kind: ${String(condition.kind || '')}`);
}

function isVisibleObservation(observation, opacityGt) {
  if (!observation || observation.targetMissing) {
    return false;
  }
  const opacity = Number.parseFloat(String(observation.opacity ?? '1'));
  return (
    observation.display !== 'none' &&
    observation.visibility === 'visible' &&
    Number(observation.boundingClientRect?.width || 0) > 0 &&
    Number(observation.boundingClientRect?.height || 0) > 0 &&
    (opacityGt === undefined || opacity > opacityGt)
  );
}

function isHiddenObservation(observation) {
  if (!observation || observation.targetMissing) {
    return true;
  }
  return (
    observation.display === 'none' ||
    observation.visibility !== 'visible' ||
    Number(observation.boundingClientRect?.width || 0) <= 0 ||
    Number(observation.boundingClientRect?.height || 0) <= 0
  );
}

function isWaitConditionSatisfied(observation, condition) {
  if (condition.kind === 'existence') {
    return condition.exists ? observation.exists === true : observation.exists === false;
  }
  if (condition.kind === 'visibility') {
    return condition.visibility === 'hidden'
      ? isHiddenObservation(observation)
      : isVisibleObservation(observation, condition.opacityGt);
  }
  if (condition.kind === 'text') {
    return String(observation.text || '').includes(condition.includes);
  }
  return false;
}

function formatWaitObservation(observation) {
  if (!observation) {
    return 'unavailable';
  }
  if ('exists' in observation || 'count' in observation || 'display' in observation) {
    return [
      `exists=${observation.exists === true ? 'true' : 'false'}`,
      `count=${String(observation.count ?? 0)}`,
      `display=${String(observation.display ?? '')}`,
      `visibility=${String(observation.visibility ?? '')}`,
      `opacity=${String(observation.opacity ?? '')}`,
    ].join(', ');
  }
  if ('text' in observation) {
    return `text=${JSON.stringify(observation.text || '')}`;
  }
  return 'unavailable';
}

function formatQueryResponse(pageIndex, selector, nth, diagnostics, fields) {
  const lines = [`pageIndex: ${pageIndex}`, `selector: ${selector}`];
  if (nth !== undefined) {
    lines.push(`nth: ${nth}`);
  }
  if (diagnostics.targetMissing) {
    if (hasTargetSpecificQueryField(fields)) {
      throw new Error(`element index ${diagnostics.targetIndex} is out of range for selector: ${selector}`);
    }
    for (const field of fields) {
      if (field === 'exists') {
        lines.push(`exists: ${diagnostics.exists ? 'true' : 'false'}`);
        continue;
      }
      if (field === 'count') {
        lines.push(`count: ${formatQueryValue(field, diagnostics.count)}`);
      }
    }
    return lines.join('\n');
  }
  for (const field of fields) {
    lines.push(`${field}: ${formatQueryValue(field, diagnostics[field])}`);
  }
  return lines.join('\n');
}

async function getWaitPageObservation(page) {
  const text = await evaluateExpression(
    page,
    `(() => document.body ? document.body.innerText || '' : '')()`
  );
  return { text };
}

async function getWaitSelectorObservation(page, selector, nth, frameSelector, pierceShadow) {
  return getElementDiagnostics(page, selector, nth, frameSelector, pierceShadow);
}

async function handleWaitFor(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const selector = typeof toolArgs.selector === 'string' ? toolArgs.selector.trim() : '';
  const nth = requireOptionalNonNegativeInteger(toolArgs.nth, 'nth');
  const frameSelector = parseOptionalNonEmptyString(toolArgs.frameSelector);
  const pierceShadow = toolArgs.pierceShadow === true;
  const timeoutMs = requirePositiveIntegerOrDefault(toolArgs.timeoutMs, 'timeoutMs', DEFAULT_WAIT_TIMEOUT_MS);
  const pollIntervalMs = requirePositiveIntegerOrDefault(
    toolArgs.pollIntervalMs,
    'pollIntervalMs',
    DEFAULT_WAIT_POLL_INTERVAL_MS
  );
  const condition = parseWaitCondition(toolArgs.condition, selector !== '');
  const deadline = Date.now() + timeoutMs;
  let lastObserved = null;

  while (Date.now() <= deadline) {
    lastObserved = selector
      ? await getWaitSelectorObservation(page, selector, nth, frameSelector, pierceShadow)
      : await getWaitPageObservation(page);
    if (isWaitConditionSatisfied(lastObserved, condition)) {
      return `pageIndex: ${pageIndex}${selector ? `\nselector: ${selector}` : ''}${formatScopedSelectorSuffix(frameSelector, pierceShadow)}\nstatus: satisfied`;
    }
    if (Date.now() + pollIntervalMs > deadline) {
      break;
    }
    await sleep(pollIntervalMs);
  }

  throw new Error(`wait condition timed out\nlastObserved: ${formatWaitObservation(lastObserved)}`);
}

async function handleEval(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const expression = requireNonEmptyString(toolArgs.expression, 'expression');
  const mode = toolArgs.mode === 'readwrite' ? 'readwrite' : 'readonly';
  const evalMode = getBrowserEvalMode();

  if (evalMode === 'disabled') {
    throw new Error('browser_eval is disabled by CCS_BROWSER_EVAL_MODE=disabled');
  }
  if (mode === 'readwrite' && evalMode !== 'readwrite') {
    throw new Error(`browser_eval readwrite mode is disabled by CCS_BROWSER_EVAL_MODE=${evalMode}`);
  }

  const response = await sendCdpCommand(page, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    ...(mode === 'readonly' ? { throwOnSideEffect: true } : {}),
  });

  if (response?.exceptionDetails?.text) {
    throw new Error(response.exceptionDetails.text);
  }
  if (!response?.result) {
    throw new Error('evaluation result is not JSON-serializable');
  }

  const result = response.result;
  const value = Object.prototype.hasOwnProperty.call(result, 'value') ? result.value : undefined;
  if (value === undefined && result.type !== 'undefined') {
    throw new Error('evaluation result is not JSON-serializable');
  }

  return `pageIndex: ${pageIndex}\nmode: ${mode}\nvalue: ${JSON.stringify(value)}`;
}

async function handleHover(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const selector = requireNonEmptyString(toolArgs.selector, 'selector');
  const frameSelector = parseOptionalNonEmptyString(toolArgs.frameSelector);
  const pierceShadow = toolArgs.pierceShadow === true;
  const state = await getScrolledElementState(page, selector, frameSelector, pierceShadow);
  if (!state.exists) {
    throw new Error(`element not found for selector: ${selector}`);
  }
  if (state.connected !== true) {
    throw new Error(`element is detached for selector: ${selector}`);
  }
  if (state.interactable !== true || !state.centerPoint) {
    throw new Error(`element is hidden or not interactable for selector: ${selector}`);
  }

  await sendCdpCommand(page, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: state.centerPoint.x,
    y: state.centerPoint.y,
    button: 'none',
    buttons: 0,
    pointerType: 'mouse',
  });

  return `pageIndex: ${pageIndex}\nselector: ${selector}${formatScopedSelectorSuffix(frameSelector, pierceShadow)}\nstatus: hovered`;
}

async function handleQuery(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const selector = requireNonEmptyString(toolArgs.selector, 'selector');
  const nth = requireOptionalNonNegativeInteger(toolArgs.nth, 'nth');
  const frameSelector = parseOptionalNonEmptyString(toolArgs.frameSelector);
  const pierceShadow = toolArgs.pierceShadow === true;
  const fields = parseQueryFields(toolArgs.fields);
  const diagnostics = await getElementDiagnostics(page, selector, nth, frameSelector, pierceShadow);
  return formatQueryResponse(pageIndex, selector, nth, diagnostics, fields);
}

async function handleElementScreenshot(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const selector = requireNonEmptyString(toolArgs.selector, 'selector');
  const frameSelector = parseOptionalNonEmptyString(toolArgs.frameSelector);
  const pierceShadow = toolArgs.pierceShadow === true;
  const state = await getScrolledElementState(page, selector, frameSelector, pierceShadow);
  if (!state.exists) {
    throw new Error(`element not found for selector: ${selector}`);
  }
  if (state.connected !== true) {
    throw new Error(`element is detached for selector: ${selector}`);
  }
  if (state.interactable !== true || !state.visibleClip) {
    throw new Error(`element has empty bounds for selector: ${selector}`);
  }
  if (state.visibleClip.width <= 0 || state.visibleClip.height <= 0) {
    throw new Error(`element has empty bounds for selector: ${selector}`);
  }

  const response = await sendCdpCommand(page, 'Page.captureScreenshot', {
    format: 'png',
    clip: state.visibleClip,
  });

  const data = response && typeof response.data === 'string' ? response.data : '';
  if (!data) {
    throw new Error('screenshot capture failed');
  }

  return `pageIndex: ${pageIndex}\nselector: ${selector}${formatScopedSelectorSuffix(frameSelector, pierceShadow)}\nformat: png\ndata: ${data}`;
}

async function waitForPageEvent({ page, timeoutMs, event }) {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  return await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      abortSocket(ws);
      reject(new Error(`event wait timed out for kind: ${event.kind}`));
    }, timeoutMs);

    const settleError = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      abortSocket(ws);
      reject(toSocketError(error));
    };

    const settleSuccess = (observed) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      closeSocket(ws);
      resolve(observed);
    };

    addSocketListener(ws, 'open', () => {
      if (event.kind === 'dialog' || event.kind === 'navigation') {
        ws.send(JSON.stringify({ id: ++requestCounter, method: 'Page.enable', params: {} }));
      }
      if (event.kind === 'request') {
        ws.send(JSON.stringify({ id: ++requestCounter, method: 'Network.enable', params: {} }));
      }
    });

    addSocketListener(ws, 'message', (data) => {
      void (async () => {
        const raw = await getSocketMessageText(data);
        let message;
        try {
          message = JSON.parse(raw);
        } catch {
          return;
        }
        if (!message || typeof message !== 'object' || typeof message.method !== 'string') {
          return;
        }
        let observed = null;
        if (message.method === 'Page.javascriptDialogOpening') {
          observed = { type: message.params?.type || '', message: message.params?.message || '' };
        } else if (message.method === 'Page.frameNavigated') {
          const frame = message.params?.frame;
          if (!frame?.parentId) {
            observed = { url: frame?.url || '' };
          }
        } else if (message.method === 'Network.requestWillBeSent') {
          observed = {
            url: message.params?.request?.url || '',
            method: message.params?.request?.method || '',
          };
        }
        if (observed && matchesObservedEvent(event, observed)) {
          settleSuccess(observed);
        }
      })().catch(settleError);
    });

    addSocketListener(ws, 'error', settleError);
    addSocketListener(ws, 'close', () => {
      if (!settled) {
        settleError(new Error('Browser MCP lost the DevTools websocket connection.'));
      }
    });
  });
}

async function waitForBrowserDownloadEvent(timeoutMs, event) {
  const targets = await fetchJson(`${getHttpUrl()}/json/list`);
  const browserTarget = Array.isArray(targets)
    ? targets.find((target) => target && typeof target === 'object' && target.type === 'browser')
    : null;
  if (!browserTarget || typeof browserTarget.webSocketDebuggerUrl !== 'string' || !browserTarget.webSocketDebuggerUrl) {
    throw new Error('browser-level download events are unavailable');
  }

  const ws = new WebSocket(browserTarget.webSocketDebuggerUrl);
  return await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      abortSocket(ws);
      reject(new Error('event wait timed out for kind: download'));
    }, timeoutMs);

    const settleError = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      abortSocket(ws);
      reject(toSocketError(error));
    };

    const settleSuccess = (observed) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      closeSocket(ws);
      resolve(observed);
    };

    addSocketListener(ws, 'message', (data) => {
      void (async () => {
        const raw = await getSocketMessageText(data);
        let message;
        try {
          message = JSON.parse(raw);
        } catch {
          return;
        }
        if (message?.method !== 'Browser.downloadWillBegin') {
          return;
        }
        const observed = {
          url: message.params?.url || '',
          suggestedFilename: message.params?.suggestedFilename || '',
        };
        if (matchesObservedEvent(event, observed)) {
          settleSuccess(observed);
        }
      })().catch(settleError);
    });

    addSocketListener(ws, 'error', settleError);
    addSocketListener(ws, 'close', () => {
      if (!settled) {
        settleError(new Error('Browser MCP lost the DevTools websocket connection.'));
      }
    });
  });
}

async function waitForMatchingEvent({ page, timeoutMs, event }) {
  if (event.kind === 'download') {
    return await waitForBrowserDownloadEvent(timeoutMs, event);
  }
  return await waitForPageEvent({ page, timeoutMs, event });
}

async function handleWaitForEvent(toolArgs) {
  const { page, pageIndex } = await getSelectedPage(toolArgs);
  const timeoutMs = requirePositiveIntegerOrDefault(toolArgs.timeoutMs, 'timeoutMs', DEFAULT_WAIT_TIMEOUT_MS);
  const event = parseEventCondition(toolArgs.event);
  const observed = await waitForMatchingEvent({ page, pageIndex, timeoutMs, event });
  return `pageIndex: ${pageIndex}\nevent: ${event.kind}\nstatus: observed\ndetail: ${JSON.stringify(observed)}`;
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

    if (toolName === TOOL_PRESS_KEY) {
      const text = await handlePressKey(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_SCROLL) {
      const text = await handleScroll(toolArgs);
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

    if (toolName === TOOL_WAIT_FOR) {
      const text = await handleWaitFor(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_EVAL) {
      const text = await handleEval(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_HOVER) {
      const text = await handleHover(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_QUERY) {
      const text = await handleQuery(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_TAKE_ELEMENT_SCREENSHOT) {
      const text = await handleElementScreenshot(toolArgs);
      writeResponse(id, {
        content: [{ type: 'text', text }],
      });
      return;
    }

    if (toolName === TOOL_WAIT_FOR_EVENT) {
      const text = await handleWaitForEvent(toolArgs);
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
