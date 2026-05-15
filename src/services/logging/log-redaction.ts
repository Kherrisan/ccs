/**
 * Sensitive log key matcher (single source of truth).
 *
 * Add new patterns conservatively. Numeric/boolean values are passed through
 * even when their key matches (e.g., `expires_at` epoch numbers stay readable);
 * only string and object values are redacted.
 */
const SENSITIVE_KEY_PATTERN =
  /^(authorization|proxy[_-]?authorization|cookie|set-cookie|password|password_hash|secret|client[_-]?secret|token|auth[_-]?token|access[_-]?token|refresh[_-]?token|id[_-]?token|bearer|assertion|api[_-]?key|x[_-]?api[_-]?key|x[_-]?goog[_-]?api[_-]?key|management[_-]?key|copilot[_-]?token|cursor[_-]?session[_-]?key|oauth[_-]?code|auth[_-]?code)$/i;

/** CLI flags whose following argument should be redacted in argv arrays. */
const SENSITIVE_ARGV_FLAG_PATTERN =
  /^--(token|api[_-]?key|auth|auth[_-]?token|secret|bearer|password|client[_-]?secret|refresh[_-]?token|access[_-]?token|id[_-]?token)$/i;

/** Bearer/Basic/Token auth-scheme prefix in raw string values. */
const AUTH_SCHEME_VALUE_PATTERN = /^(Bearer|Basic|Token)\s+\S+/;

const MAX_STRING_LENGTH = 2000;
const MAX_DEPTH = 5;

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`;
}

function maskAuthSchemeValue(value: string): string {
  const match = AUTH_SCHEME_VALUE_PATTERN.exec(value);
  if (!match) return value;
  return `${match[1]} [redacted]`;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (depth >= MAX_DEPTH) {
    return '[max-depth]';
  }

  if (typeof value === 'string') {
    return truncateString(maskAuthSchemeValue(value));
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateString(value.message),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      sanitized[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? '[redacted]'
        : sanitizeValue(nestedValue, depth + 1);
    }
    return sanitized;
  }

  return String(value);
}

export function redactContext(
  context: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!context) {
    return {};
  }

  return sanitizeValue(context, 0) as Record<string, unknown>;
}

/**
 * Redact sensitive values from a CLI argv array (e.g. for spawn-arg logging).
 *
 * Pairs every sensitive flag (`--token`, `--api-key`, etc.) with its following
 * argument and replaces that argument with `[redacted]`. Non-sensitive args
 * pass through unchanged.
 */
export function redactArgv(argv: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    out.push(arg);
    if (SENSITIVE_ARGV_FLAG_PATTERN.test(arg) && i + 1 < argv.length) {
      out.push('[redacted]');
      i++;
    }
  }
  return out;
}
