import { Router, Request, Response } from 'express';
import { getCatalogRoutingSnapshot } from '../../cliproxy/catalog-routing';

const router = Router();

/**
 * GET /api/cliproxy/catalog - Get merged model catalogs
 * Returns resolved catalogs with live -> cache -> static fallback ordering.
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const snapshot = await getCatalogRoutingSnapshot();
    res.json({
      catalogs: snapshot.catalogs,
      routing: snapshot.routing,
      source: snapshot.source,
      cache: {
        synced: snapshot.source !== 'static' || snapshot.cacheAge !== null,
        age: snapshot.cacheAge,
      },
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
