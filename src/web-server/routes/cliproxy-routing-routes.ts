import { Router, Request, Response } from 'express';
import {
  applyCliproxyRoutingStrategy,
  normalizeCliproxyRoutingStrategy,
  readCliproxyRoutingState,
} from '../../cliproxy/routing-strategy';
import { requireLocalAccessWhenAuthDisabled } from '../middleware/auth-middleware';

const router = Router();

router.use((req: Request, res: Response, next) => {
  if (
    requireLocalAccessWhenAuthDisabled(
      req,
      res,
      'CLIProxy routing endpoints require localhost access when dashboard auth is disabled.'
    )
  ) {
    next();
  }
});

router.get('/routing/strategy', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await readCliproxyRoutingState());
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

router.put('/routing/strategy', async (req: Request, res: Response): Promise<void> => {
  const strategy = normalizeCliproxyRoutingStrategy(req.body?.value ?? req.body?.strategy);
  if (!strategy) {
    res.status(400).json({ error: 'Invalid strategy. Use: round-robin or fill-first' });
    return;
  }

  try {
    res.json(await applyCliproxyRoutingStrategy(strategy));
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

export default router;
