import { describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent } from '@tests/setup/test-utils';
import { CodexMcpServersCard } from '@/components/compatible-cli/codex-mcp-servers-card';

describe('CodexMcpServersCard', () => {
  it('blocks creating the reserved ccs_browser entry from the generic MCP editor', async () => {
    render(<CodexMcpServersCard entries={[]} onSave={vi.fn()} onDelete={vi.fn()} />);

    const nameInput = screen.getByPlaceholderText('playwright');
    await userEvent.type(nameInput, 'ccs_browser');

    expect(
      screen.getAllByText(
        (_, element) =>
          element?.textContent?.includes(
            'ccs_browser is reserved for the CCS-managed browser tooling path.'
          ) ?? false
      )[0]
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save MCP server' })).toBeDisabled();
  });
});
