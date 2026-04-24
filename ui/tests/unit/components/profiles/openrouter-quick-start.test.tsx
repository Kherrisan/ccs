import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import { OpenRouterQuickStart } from '@/components/profiles/openrouter-quick-start';
import { render, screen, userEvent } from '@tests/setup/test-utils';

vi.mock('@/hooks/use-openrouter-models', () => ({
  useOpenRouterReady: () => ({
    modelCount: 318,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-local-runtime-readiness', () => ({
  useLocalRuntimeReadiness: () => ({
    data: {
      runtimes: [
        {
          id: 'ollama',
          status: 'offline',
          endpoint: 'http://127.0.0.1:11434',
          commandHint: 'ollama serve',
          recommendedModel: 'gemma4:e4b',
          recommendedModelInstalled: false,
          detectedModelCount: 0,
        },
        {
          id: 'llamacpp',
          status: 'ready',
          endpoint: 'http://127.0.0.1:8080',
          commandHint: './server --host 0.0.0.0 --port 8080 -m model.gguf',
          recommendedModel: null,
          recommendedModelInstalled: true,
          detectedModelCount: 1,
        },
      ],
    },
    isLoading: false,
  }),
}));

describe('OpenRouterQuickStart', () => {
  const props = {
    onOpenRouterClick: vi.fn(),
    onAlibabaCodingPlanClick: vi.fn(),
    onCliproxyClick: vi.fn(),
    onCustomClick: vi.fn(),
    onOllamaClick: vi.fn(),
    onLlamacppClick: vi.fn(),
  };

  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('prompts the user to select an existing API profile instead of showing the empty-state copy', () => {
    render(<OpenRouterQuickStart hasProfiles profileCount={1} {...props} />);

    expect(
      screen.getByRole('heading', { name: 'Choose a profile or add another lane' })
    ).toBeInTheDocument();
    expect(screen.getByText('1 profile')).toBeInTheDocument();
    expect(screen.getByText(/You already have 1 profile in this workspace\./)).toBeInTheDocument();
    expect(screen.queryByText('No API profiles yet')).not.toBeInTheDocument();
  });

  it('shows the new local lane with readiness-aware calls to action', async () => {
    render(<OpenRouterQuickStart hasProfiles={false} profileCount={0} {...props} />);

    expect(
      screen.getByRole('heading', { name: 'Choose your first profile lane' })
    ).toBeInTheDocument();
    expect(screen.getByText('Ollama + Gemma 4')).toBeInTheDocument();
    expect(screen.getByText('llama.cpp')).toBeInTheDocument();
    expect(
      screen.getByText('Run `ollama serve` to bring the local endpoint online.')
    ).toBeInTheDocument();
    expect(screen.getByText('Endpoint ready at http://127.0.0.1:8080')).toBeInTheDocument();
    expect(screen.getByText('No local models detected yet')).toBeInTheDocument();
    expect(screen.getByText('1 local model detected')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Set up Ollama' }));
    expect(props.onOllamaClick).toHaveBeenCalledTimes(1);
  });
});
