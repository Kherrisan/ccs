import { describe, expect, it } from 'bun:test';
import {
  appendThirdPartyImageAnalysisToolArgs,
  getImageAnalysisSteeringPrompt,
} from '../../../../src/utils/image-analysis';

describe('appendThirdPartyImageAnalysisToolArgs', () => {
  it('appends the steering prompt for image analysis', () => {
    const args = appendThirdPartyImageAnalysisToolArgs(['-p', 'describe the screenshot']);

    expect(args).toEqual(['-p', 'describe the screenshot', '--append-system-prompt', getImageAnalysisSteeringPrompt()]);
  });

  it('does not duplicate the steering prompt when already present', () => {
    const steeringPrompt = getImageAnalysisSteeringPrompt();
    const args = appendThirdPartyImageAnalysisToolArgs([
      '-p',
      'describe the screenshot',
      '--append-system-prompt',
      steeringPrompt,
    ]);

    expect(args.filter((arg) => arg === steeringPrompt)).toHaveLength(1);
    expect(args.filter((arg) => arg === '--append-system-prompt')).toHaveLength(1);
  });

  it('preserves trailing arguments after --', () => {
    const args = appendThirdPartyImageAnalysisToolArgs(['-p', 'describe', '--', 'extra']);

    expect(args).toEqual([
      '-p',
      'describe',
      '--append-system-prompt',
      getImageAnalysisSteeringPrompt(),
      '--',
      'extra',
    ]);
  });
});
