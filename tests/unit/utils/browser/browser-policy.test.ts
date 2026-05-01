import { describe, expect, it } from 'bun:test';
import {
  resolveBrowserExposure,
  resolveBrowserLaunchFlagResolution,
} from '../../../../src/utils/browser/browser-policy';

describe('browser policy', () => {
  it('strips browser launch flags and records the override', () => {
    expect(resolveBrowserLaunchFlagResolution(['glm', '--browser', 'check app'])).toEqual({
      override: 'force-enable',
      argsWithoutFlags: ['glm', 'check app'],
    });
    expect(resolveBrowserLaunchFlagResolution(['glm', '--no-browser', 'check app'])).toEqual({
      override: 'force-disable',
      argsWithoutFlags: ['glm', 'check app'],
    });
  });

  it('rejects conflicting browser launch flags', () => {
    expect(() => resolveBrowserLaunchFlagResolution(['--browser', '--no-browser'])).toThrow(
      'Use either `--browser` or `--no-browser`, not both.'
    );
  });

  it('stops parsing browser launch flags after the option terminator', () => {
    expect(resolveBrowserLaunchFlagResolution(['glm', '--', '--browser', 'literal'])).toEqual({
      override: undefined,
      argsWithoutFlags: ['glm', '--', '--browser', 'literal'],
    });
  });

  it('resolves browser exposure from saved policy and one-run overrides', () => {
    expect(resolveBrowserExposure({ enabled: true, policy: 'auto' })).toMatchObject({
      exposeByDefault: true,
      exposeForLaunch: true,
    });
    expect(resolveBrowserExposure({ enabled: true, policy: 'manual' })).toMatchObject({
      exposeByDefault: false,
      exposeForLaunch: false,
    });
    expect(
      resolveBrowserExposure({ enabled: true, policy: 'manual' }, 'force-enable')
    ).toMatchObject({
      exposeByDefault: false,
      exposeForLaunch: true,
    });
    expect(
      resolveBrowserExposure({ enabled: true, policy: 'auto' }, 'force-disable')
    ).toMatchObject({
      exposeByDefault: true,
      exposeForLaunch: false,
    });
  });
});
