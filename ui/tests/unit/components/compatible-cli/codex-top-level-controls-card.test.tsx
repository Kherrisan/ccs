import { describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent } from '@tests/setup/test-utils';
import { CodexTopLevelControlsCard } from '@/components/compatible-cli/codex-top-level-controls-card';

describe('CodexTopLevelControlsCard', () => {
  it('submits only changed fields so untouched unsupported values are preserved upstream', async () => {
    const onSave = vi.fn();

    render(
      <CodexTopLevelControlsCard
        values={{
          model: null,
          modelReasoningEffort: null,
          modelProvider: null,
          approvalPolicy: null,
          sandboxMode: null,
          webSearch: null,
          toolOutputTokenLimit: null,
          personality: null,
        }}
        providerNames={[]}
        onSave={onSave}
      />
    );

    const saveButton = screen.getByRole('button', { name: 'Save top-level settings' });
    expect(saveButton).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText('gpt-5.4'), 'gpt-5.4-mini');
    expect(saveButton).toBeEnabled();

    await userEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ model: 'gpt-5.4-mini' });
  });
});
