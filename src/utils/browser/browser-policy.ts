import type { BrowserToolPolicy } from '../../config/unified-config-types';

export type BrowserLaunchOverride = 'force-enable' | 'force-disable';

export interface BrowserLaunchFlagResolution {
  override?: BrowserLaunchOverride;
  argsWithoutFlags: string[];
}

export interface ResolvedBrowserExposure {
  enabled: boolean;
  policy: BrowserToolPolicy;
  override?: BrowserLaunchOverride;
  exposeByDefault: boolean;
  exposeForLaunch: boolean;
}

const ENABLE_BROWSER_FLAG = '--browser';
const DISABLE_BROWSER_FLAG = '--no-browser';

export function resolveBrowserLaunchFlagResolution(args: string[]): BrowserLaunchFlagResolution {
  let override: BrowserLaunchOverride | undefined;
  const argsWithoutFlags: string[] = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (arg === '--') {
      argsWithoutFlags.push(...args.slice(index));
      break;
    }

    if (arg === ENABLE_BROWSER_FLAG) {
      if (override === 'force-disable') {
        throw new Error('Use either `--browser` or `--no-browser`, not both.');
      }
      override = 'force-enable';
      continue;
    }

    if (arg === DISABLE_BROWSER_FLAG) {
      if (override === 'force-enable') {
        throw new Error('Use either `--browser` or `--no-browser`, not both.');
      }
      override = 'force-disable';
      continue;
    }

    argsWithoutFlags.push(arg);
  }

  return {
    override,
    argsWithoutFlags,
  };
}

export function resolveBrowserExposure(
  config: { enabled: boolean; policy: BrowserToolPolicy },
  override?: BrowserLaunchOverride
): ResolvedBrowserExposure {
  const exposeByDefault = config.enabled && config.policy === 'auto';
  const exposeForLaunch =
    config.enabled &&
    (override === 'force-enable' || (override !== 'force-disable' && exposeByDefault));

  return {
    enabled: config.enabled,
    policy: config.policy,
    override,
    exposeByDefault,
    exposeForLaunch,
  };
}

export function describeBrowserPolicy(policy: BrowserToolPolicy): string {
  return policy === 'manual' ? 'manual' : 'auto';
}

export function describeDefaultBrowserExposure(policy: BrowserToolPolicy): string {
  return policy === 'manual' ? 'hidden until `--browser`' : 'auto-exposed';
}

export function getBlockedBrowserOverrideWarning(
  laneLabel: string,
  exposure: ResolvedBrowserExposure
): string | undefined {
  if (exposure.override === 'force-enable' && !exposure.enabled) {
    return `Browser tooling was requested with \`--browser\`, but ${laneLabel} is disabled in CCS config.`;
  }

  return undefined;
}
