/**
 * Provider Routes - OpenAI-compatible provider management
 */

import { Router, Request, Response } from 'express';
import {
  listOpenAICompatProviders,
  getOpenAICompatProvider,
  addOpenAICompatProvider,
  updateOpenAICompatProvider,
  removeOpenAICompatProvider,
  OPENROUTER_TEMPLATE,
  TOGETHER_TEMPLATE,
} from '../../cliproxy/ai-providers/openai-compat-manager';
import { isReservedName, RESERVED_PROFILE_NAMES } from '../../config/reserved-names';

const router = Router();

/**
 * GET /api/cliproxy/openai-compat - List all OpenAI-compatible providers
 */
router.get('/', (_req: Request, res: Response): void => {
  try {
    const providers = listOpenAICompatProviders();
    // Mask API keys for security
    const masked = providers.map((p) => ({
      ...p,
      apiKey: p.apiKey ? (p.apiKey.length > 8 ? `...${p.apiKey.slice(-4)}` : '***') : '',
    }));
    res.json({ providers: masked });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/cliproxy/openai-compat/templates - Get pre-configured provider templates
 */
router.get('/templates', (_req: Request, res: Response): void => {
  res.json({
    templates: [
      { ...OPENROUTER_TEMPLATE, description: 'OpenRouter - Access multiple AI models' },
      { ...TOGETHER_TEMPLATE, description: 'Together AI - Open source models' },
    ],
  });
});

/**
 * GET /api/cliproxy/openai-compat/:name - Get a specific provider
 */
router.get('/:name', (req: Request, res: Response): void => {
  try {
    const provider = getOpenAICompatProvider(req.params.name);
    if (!provider) {
      res.status(404).json({ error: `Provider '${req.params.name}' not found` });
      return;
    }
    // Mask API key
    res.json({
      ...provider,
      apiKey: provider.apiKey
        ? provider.apiKey.length > 8
          ? `...${provider.apiKey.slice(-4)}`
          : '***'
        : '',
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/cliproxy/openai-compat - Add a new provider
 * Body: { name, baseUrl, apiKey, models: [{ name, alias }] }
 */
router.post('/', (req: Request, res: Response): void => {
  try {
    const { name, baseUrl, apiKey, models } = req.body;

    // Validation
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    // Validate reserved names
    if (isReservedName(name)) {
      res.status(400).json({
        error: `Provider name '${name}' is reserved`,
        reserved: RESERVED_PROFILE_NAMES,
      });
      return;
    }
    if (!baseUrl || typeof baseUrl !== 'string') {
      res.status(400).json({ error: 'baseUrl is required' });
      return;
    }
    if (!apiKey || typeof apiKey !== 'string') {
      res.status(400).json({ error: 'apiKey is required' });
      return;
    }
    if (models && !Array.isArray(models)) {
      res.status(400).json({ error: 'models must be an array' });
      return;
    }

    addOpenAICompatProvider({
      name,
      baseUrl,
      apiKey,
      models: models || [],
    });

    res.status(201).json({ success: true, name });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('already exists')) {
      res.status(409).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

/**
 * PUT /api/cliproxy/openai-compat/:name - Update a provider
 * Body: { baseUrl?, apiKey?, models?, name? (for rename) }
 */
router.put('/:name', (req: Request, res: Response): void => {
  try {
    const { baseUrl, apiKey, models, name: newName } = req.body;

    updateOpenAICompatProvider(req.params.name, {
      baseUrl,
      apiKey,
      models,
      name: newName,
    });

    res.json({ success: true });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

/**
 * DELETE /api/cliproxy/openai-compat/:name - Remove a provider
 */
router.delete('/:name', (req: Request, res: Response): void => {
  try {
    const removed = removeOpenAICompatProvider(req.params.name);
    if (!removed) {
      res.status(404).json({ error: `Provider '${req.params.name}' not found` });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
