import { Router, type Request, type Response } from 'express';
import { getBrowserConfig, mutateUnifiedConfig } from '../../config/unified-config-loader';
import { getBrowserStatus } from '../../utils/browser';
import { requireLocalAccessWhenAuthDisabled } from '../middleware/auth-middleware';

const router = Router();
const BROWSER_LOCAL_ACCESS_ERROR =
  'Browser endpoints require localhost access when dashboard auth is disabled.';

interface BrowserRouteBody {
  claude?: {
    enabled?: boolean;
    policy?: 'auto' | 'manual';
    userDataDir?: string;
    devtoolsPort?: number;
  };
  codex?: {
    enabled?: boolean;
    policy?: 'auto' | 'manual';
  };
}

function isValidBrowserPolicy(value: string): value is 'auto' | 'manual' {
  return value === 'auto' || value === 'manual';
}

function isValidDevtoolsPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

router.use((req: Request, res: Response, next) => {
  if (requireLocalAccessWhenAuthDisabled(req, res, BROWSER_LOCAL_ACCESS_ERROR)) {
    next();
  }
});

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const config = getBrowserConfig();
    const status = await getBrowserStatus();
    res.json({
      config: toBrowserRouteConfig(config),
      status,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await getBrowserStatus());
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.put('/', async (req: Request, res: Response): Promise<void> => {
  if (
    req.body === null ||
    req.body === undefined ||
    typeof req.body !== 'object' ||
    Array.isArray(req.body)
  ) {
    res.status(400).json({ error: 'Invalid request body. Must be an object.' });
    return;
  }

  const { claude, codex } = req.body as BrowserRouteBody;
  if (claude && (typeof claude !== 'object' || Array.isArray(claude))) {
    res.status(400).json({ error: 'Invalid value for claude. Must be an object.' });
    return;
  }
  if (codex && (typeof codex !== 'object' || Array.isArray(codex))) {
    res.status(400).json({ error: 'Invalid value for codex. Must be an object.' });
    return;
  }
  if (claude?.enabled !== undefined && typeof claude.enabled !== 'boolean') {
    res.status(400).json({ error: 'Invalid value for claude.enabled. Must be a boolean.' });
    return;
  }
  if (
    claude?.policy !== undefined &&
    (typeof claude.policy !== 'string' || !isValidBrowserPolicy(claude.policy))
  ) {
    res.status(400).json({ error: 'Invalid value for claude.policy. Must be auto or manual.' });
    return;
  }
  if (claude?.userDataDir !== undefined && typeof claude.userDataDir !== 'string') {
    res.status(400).json({ error: 'Invalid value for claude.userDataDir. Must be a string.' });
    return;
  }
  if (
    claude?.devtoolsPort !== undefined &&
    (typeof claude.devtoolsPort !== 'number' || !isValidDevtoolsPort(claude.devtoolsPort))
  ) {
    res.status(400).json({
      error: 'Invalid value for claude.devtoolsPort. Must be an integer between 1 and 65535.',
    });
    return;
  }
  if (codex?.enabled !== undefined && typeof codex.enabled !== 'boolean') {
    res.status(400).json({ error: 'Invalid value for codex.enabled. Must be a boolean.' });
    return;
  }
  if (
    codex?.policy !== undefined &&
    (typeof codex.policy !== 'string' || !isValidBrowserPolicy(codex.policy))
  ) {
    res.status(400).json({ error: 'Invalid value for codex.policy. Must be auto or manual.' });
    return;
  }

  try {
    const current = getBrowserConfig();
    const nextClaudeUserDataDir =
      claude?.userDataDir === undefined ? current.claude.user_data_dir : claude.userDataDir.trim();
    mutateUnifiedConfig((config) => {
      config.browser = {
        claude: {
          enabled: claude?.enabled ?? current.claude.enabled,
          policy: claude?.policy ?? current.claude.policy,
          user_data_dir: nextClaudeUserDataDir,
          devtools_port: claude?.devtoolsPort ?? current.claude.devtools_port,
        },
        codex: {
          enabled: codex?.enabled ?? current.codex.enabled,
          policy: codex?.policy ?? current.codex.policy,
        },
      };
    });

    const config = getBrowserConfig();
    const status = await getBrowserStatus();
    res.json({
      success: true,
      browser: {
        config: toBrowserRouteConfig(config),
        status,
      },
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

function toBrowserRouteConfig(config: ReturnType<typeof getBrowserConfig>) {
  return {
    claude: {
      enabled: config.claude.enabled,
      policy: config.claude.policy,
      userDataDir: config.claude.user_data_dir,
      devtoolsPort: config.claude.devtools_port,
    },
    codex: {
      enabled: config.codex.enabled,
      policy: config.codex.policy,
    },
  };
}

export default router;
