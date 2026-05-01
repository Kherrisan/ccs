const GITLAB_PAT_ERROR_DETAIL_MAX_LENGTH = 500;
const GITLAB_PAT_ERROR_DETAIL_TRUNCATION_SUFFIX = '...[truncated]';
const HTML_ERROR_RESPONSE_OMITTED = '[HTML error response omitted]';

function sanitizeGitLabPatErrorDetail(
  detail: string | undefined,
  submittedToken?: string
): string | undefined {
  const trimmed = detail?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^<!doctype html/i.test(trimmed) || /^<html/i.test(trimmed) || /^<[^>]+>/.test(trimmed)) {
    return HTML_ERROR_RESPONSE_OMITTED;
  }

  let sanitized = trimmed.replace(
    /"(access[_-]?token|refresh[_-]?token|authorization|cookie|set-cookie|api[_-]?key|session[_-]?token|token|personal_access_token)"\s*:\s*"[^"]*"/gi,
    '"$1":"[redacted]"'
  );

  if (submittedToken) {
    sanitized = sanitized.split(submittedToken).join('[redacted]');
  }

  sanitized = sanitized
    .replace(/glpat-[A-Za-z0-9._-]+/gi, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
    .replace(/\s+/g, ' ');

  if (sanitized.length > GITLAB_PAT_ERROR_DETAIL_MAX_LENGTH) {
    sanitized = `${sanitized.slice(
      0,
      GITLAB_PAT_ERROR_DETAIL_MAX_LENGTH - GITLAB_PAT_ERROR_DETAIL_TRUNCATION_SUFFIX.length
    )}${GITLAB_PAT_ERROR_DETAIL_TRUNCATION_SUFFIX}`;
  }

  return sanitized;
}

export function parseGitLabPatAuthResponse(
  responseOk: boolean,
  responseStatus: number,
  responseBody: string,
  submittedToken?: string
):
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; payload: Record<string, unknown>; errorMessage: string } {
  const trimmedBody = responseBody.trim();
  let payload: Record<string, unknown> = {};

  if (trimmedBody) {
    try {
      payload = JSON.parse(trimmedBody) as Record<string, unknown>;
    } catch {
      payload = {
        error:
          sanitizeGitLabPatErrorDetail(trimmedBody, submittedToken) ||
          `GitLab PAT login failed with status ${responseStatus}`,
      };
    }
  }

  const payloadError =
    typeof payload.error === 'string'
      ? sanitizeGitLabPatErrorDetail(payload.error, submittedToken)
      : undefined;
  const fallbackError =
    sanitizeGitLabPatErrorDetail(trimmedBody, submittedToken) ||
    `GitLab PAT login failed with status ${responseStatus}`;

  if (!responseOk) {
    return {
      ok: false,
      payload,
      errorMessage: payloadError || fallbackError,
    };
  }

  if (payload.status !== 'ok') {
    return {
      ok: false,
      payload,
      errorMessage: payloadError || fallbackError,
    };
  }

  return { ok: true, payload };
}
