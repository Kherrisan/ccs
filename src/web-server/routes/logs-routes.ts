import { Router, type Request, type Response } from 'express';
import { requireLocalAccessWhenAuthDisabled } from '../middleware/auth-middleware';
import { isLoggingLevel } from '../../services/logging/log-types';
import {
  getDashboardLoggingConfig,
  listDashboardLogEntries,
  listDashboardLogSources,
  updateDashboardLoggingConfig,
} from '../services/logs-dashboard-service';

const router = Router();
const LOGS_LOCAL_ACCESS_ERROR =
  'Logs endpoints require localhost access when dashboard auth is disabled.';

router.use((req: Request, res: Response, next) => {
  if (requireLocalAccessWhenAuthDisabled(req, res, LOGS_LOCAL_ACCESS_ERROR)) {
    next();
  }
});

router.get('/config', (_req: Request, res: Response) => {
  res.json({ logging: getDashboardLoggingConfig() });
});

router.put('/config', (req: Request, res: Response) => {
  const updates = req.body as Record<string, unknown>;
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    res.status(400).json({ error: 'Invalid request body. Must be an object.' });
    return;
  }

  const {
    enabled,
    level,
    rotate_mb: rotateMb,
    retain_days: retainDays,
    redact,
    live_buffer_size: liveBufferSize,
  } = updates;

  if (enabled !== undefined && typeof enabled !== 'boolean') {
    res.status(400).json({ error: 'enabled must be a boolean' });
    return;
  }
  if (level !== undefined && !isLoggingLevel(String(level))) {
    res.status(400).json({ error: 'level must be one of error, warn, info, debug' });
    return;
  }

  const numericPairs = [
    ['rotate_mb', rotateMb],
    ['retain_days', retainDays],
    ['live_buffer_size', liveBufferSize],
  ] as const;
  for (const [field, value] of numericPairs) {
    if (value !== undefined && (!Number.isInteger(value) || Number(value) < 1)) {
      res.status(400).json({ error: `${field} must be a positive integer` });
      return;
    }
  }

  if (redact !== undefined && typeof redact !== 'boolean') {
    res.status(400).json({ error: 'redact must be a boolean' });
    return;
  }

  res.json({
    success: true,
    logging: updateDashboardLoggingConfig({
      enabled: enabled as boolean | undefined,
      level: level as 'error' | 'warn' | 'info' | 'debug' | undefined,
      rotate_mb: rotateMb as number | undefined,
      retain_days: retainDays as number | undefined,
      redact: redact as boolean | undefined,
      live_buffer_size: liveBufferSize as number | undefined,
    }),
  });
});

router.get('/sources', (_req: Request, res: Response) => {
  res.json({ sources: listDashboardLogSources() });
});

router.get('/entries', (req: Request, res: Response) => {
  const { source, level, search, limit } = req.query;
  const parsedLimit =
    typeof limit === 'string' && Number.isInteger(Number(limit)) ? Number(limit) : undefined;

  res.json({
    entries: listDashboardLogEntries({
      source: typeof source === 'string' ? source : undefined,
      level: typeof level === 'string' && isLoggingLevel(level) ? level : undefined,
      search: typeof search === 'string' ? search : undefined,
      limit: parsedLimit,
    }),
  });
});

export default router;
