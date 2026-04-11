import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FlexibleModelSelector } from '@/components/cliproxy/provider-model-selector';
import { buildUiCatalogs } from '@/lib/model-catalogs';
import { render, screen, userEvent } from '@tests/setup/test-utils';

const noisyAgyModels = [
  { id: 'agy/gemini-3.1-pro-high', owned_by: 'antigravity' },
  { id: 'gemini-3.1-pro-high', owned_by: 'antigravity' },
  { id: 'gemini-3.1-pro-low', owned_by: 'antigravity' },
  { id: 'gemini-3.1-pro-preview', owned_by: 'antigravity' },
  { id: 'gemini-3.1-pro-preview-customtools', owned_by: 'antigravity' },
  { id: 'gemini-3-pro-preview', owned_by: 'antigravity' },
  { id: 'gemini-3-1-flash-preview', owned_by: 'antigravity' },
  { id: 'gemini-3-1-flash-preview-customtools', owned_by: 'antigravity' },
  { id: 'gpt-oss-120b-medium', owned_by: 'antigravity' },
];

const catalog = buildUiCatalogs({
  agy: {
    provider: 'agy',
    displayName: 'Antigravity',
    defaultModel: 'claude-opus-4-6-thinking',
    models: noisyAgyModels.map(({ id }) => ({ id, name: id })),
  },
}).agy;

describe('FlexibleModelSelector', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
      configurable: true,
      value: vi.fn(() => false),
    });
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('keeps the picker focused on curated Antigravity live routes', async () => {
    render(
      <FlexibleModelSelector
        label="Primary model"
        value={undefined}
        onChange={vi.fn()}
        catalog={catalog}
        allModels={noisyAgyModels}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /select model/i }));

    expect(screen.getByText('gemini-3.1-pro-high')).toBeInTheDocument();
    expect(screen.getByText('gemini-3.1-pro-low')).toBeInTheDocument();
    expect(screen.getByText('gemini-3-1-flash-preview')).toBeInTheDocument();

    expect(screen.queryByText('gemini-3.1-pro-preview')).not.toBeInTheDocument();
    expect(screen.queryByText('gemini-3-pro-preview')).not.toBeInTheDocument();
    expect(screen.queryByText('agy/gemini-3.1-pro-high')).not.toBeInTheDocument();
    expect(screen.queryByText('gemini-3-1-flash-preview-customtools')).not.toBeInTheDocument();
    expect(screen.queryByText('gpt-oss-120b-medium')).not.toBeInTheDocument();
    expect(screen.queryByText(/All Models \(/i)).not.toBeInTheDocument();
  });

  it('preserves a filtered legacy value under the current-value fallback group', async () => {
    render(
      <FlexibleModelSelector
        label="Primary model"
        value="gemini-3.1-pro-preview"
        onChange={vi.fn()}
        catalog={catalog}
        allModels={noisyAgyModels}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /gemini-3\.1-pro-preview/i }));

    expect(screen.getByText('Current value')).toBeInTheDocument();
    expect(screen.getAllByText('gemini-3.1-pro-preview').length).toBeGreaterThan(0);
    expect(screen.getByText('gemini-3.1-pro-high')).toBeInTheDocument();
  });
});
