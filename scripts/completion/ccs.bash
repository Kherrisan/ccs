# Bash completion for CCS (Claude Code Switch)
# Compatible with bash 3.2+
#
# Installation:
#   Add to ~/.bashrc or ~/.bash_profile:
#     source /path/to/ccs/scripts/completion/ccs.bash
#
#   Or install system-wide (requires sudo):
#     sudo cp scripts/completion/ccs.bash /etc/bash_completion.d/ccs

_ccs_completion() {
  local cur prev words cword
  COMPREPLY=()

  # Get current word and previous word
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"

  # Top-level completion (first argument)
  if [[ ${COMP_CWORD} -eq 1 ]]; then
    local commands="auth api cliproxy config doctor env persist sync update"
    local flags="--help --version --shell-completion -h -v -sc"
    local cliproxy_profiles="gemini codex agy qwen"
    local profiles=""

    # Add profiles from config.json (settings-based profiles)
    if [[ -f ~/.ccs/config.json ]]; then
      profiles="$profiles $(jq -r '.profiles | keys[]' ~/.ccs/config.json 2>/dev/null || true)"
    fi

    # Add profiles from profiles.json (account-based profiles)
    if [[ -f ~/.ccs/profiles.json ]]; then
      profiles="$profiles $(jq -r '.profiles | keys[]' ~/.ccs/profiles.json 2>/dev/null || true)"
    fi

    # Add cliproxy variants from config.json
    if [[ -f ~/.ccs/config.json ]]; then
      profiles="$profiles $(jq -r '.cliproxy | keys[]' ~/.ccs/config.json 2>/dev/null || true)"
    fi

    # Combine all options
    local opts="$commands $flags $cliproxy_profiles $profiles"
    COMPREPLY=( $(compgen -W "${opts}" -- ${cur}) )
    return 0
  fi

  # CLIProxy provider flags (gemini, codex, agy, qwen)
  if [[ ${COMP_WORDS[1]} =~ ^(gemini|codex|agy|qwen)$ ]]; then
    local provider_flags="--auth --config --logout --headless --help -h"
    COMPREPLY=( $(compgen -W "${provider_flags}" -- ${cur}) )
    return 0
  fi

  # auth subcommands
  if [[ ${prev} == "auth" ]]; then
    local auth_commands="create list show remove default --help -h"
    COMPREPLY=( $(compgen -W "${auth_commands}" -- ${cur}) )
    return 0
  fi

  # api subcommands
  if [[ ${prev} == "api" ]]; then
    local api_commands="create list remove --help -h"
    COMPREPLY=( $(compgen -W "${api_commands}" -- ${cur}) )
    return 0
  fi

  # cliproxy subcommands
  if [[ ${prev} == "cliproxy" ]]; then
    local cliproxy_commands="create list remove --install --latest --help -h"
    COMPREPLY=( $(compgen -W "${cliproxy_commands}" -- ${cur}) )
    return 0
  fi

  # Completion for cliproxy subcommands
  if [[ ${COMP_WORDS[1]} == "cliproxy" ]]; then
    case "${prev}" in
      remove|delete|rm)
        # Complete with cliproxy variant names
        if [[ -f ~/.ccs/config.json ]]; then
          local variants=$(jq -r '.cliproxy | keys[]' ~/.ccs/config.json 2>/dev/null || true)
          COMPREPLY=( $(compgen -W "${variants}" -- ${cur}) )
        fi
        return 0
        ;;
      create)
        # Complete with create flags
        COMPREPLY=( $(compgen -W "--provider --model --force --yes -y" -- ${cur}) )
        return 0
        ;;
      --provider)
        # Complete with provider names
        COMPREPLY=( $(compgen -W "gemini codex agy qwen" -- ${cur}) )
        return 0
        ;;
      list|ls)
        # No flags for list
        return 0
        ;;
      --install)
        # User enters version number
        return 0
        ;;
    esac
  fi

  # Completion for api subcommands
  if [[ ${COMP_WORDS[1]} == "api" ]]; then
    case "${prev}" in
      remove|delete|rm)
        # Complete with settings profile names
        if [[ -f ~/.ccs/config.json ]]; then
          local profiles=$(jq -r '.profiles | keys[]' ~/.ccs/config.json 2>/dev/null || true)
          COMPREPLY=( $(compgen -W "${profiles}" -- ${cur}) )
        fi
        return 0
        ;;
      create)
        # Complete with create flags
        COMPREPLY=( $(compgen -W "--base-url --api-key --model --force --yes -y" -- ${cur}) )
        return 0
        ;;
      list)
        # No flags for list
        return 0
        ;;
    esac
  fi

  # Completion for auth subcommands that need profile names
  if [[ ${COMP_WORDS[1]} == "auth" ]]; then
    case "${prev}" in
      show|remove|default)
        # Complete with account profile names only
        if [[ -f ~/.ccs/profiles.json ]]; then
          local profiles=$(jq -r '.profiles | keys[]' ~/.ccs/profiles.json 2>/dev/null || true)
          COMPREPLY=( $(compgen -W "${profiles}" -- ${cur}) )
        fi
        return 0
        ;;
      create)
        # Complete with create flags
        COMPREPLY=( $(compgen -W "--force" -- ${cur}) )
        return 0
        ;;
      list)
        # Complete with list flags
        COMPREPLY=( $(compgen -W "--verbose --json" -- ${cur}) )
        return 0
        ;;
    esac
  fi

  # env subcommands
  if [[ ${COMP_WORDS[1]} == "env" ]]; then
    case "${prev}" in
      env)
        # Complete with profile names and flags (inline profiles since $cliproxy_profiles is out of scope)
        local env_opts="--format --shell --ide --help -h gemini codex agy qwen iflow kiro ghcp claude default"
        if [[ -f ~/.ccs/config.json ]]; then
          env_opts="$env_opts $(jq -r '.profiles | keys[]' ~/.ccs/config.json 2>/dev/null || true)"
        fi
        if [[ -f ~/.ccs/profiles.json ]]; then
          env_opts="$env_opts $(jq -r '.profiles | keys[]' ~/.ccs/profiles.json 2>/dev/null || true)"
        fi
        COMPREPLY=( $(compgen -W "${env_opts}" -- ${cur}) )
        return 0
        ;;
      --format)
        COMPREPLY=( $(compgen -W "openai anthropic raw claude-extension" -- ${cur}) )
        return 0
        ;;
      --shell)
        COMPREPLY=( $(compgen -W "auto bash zsh fish powershell" -- ${cur}) )
        return 0
        ;;
      --ide)
        COMPREPLY=( $(compgen -W "vscode cursor windsurf" -- ${cur}) )
        return 0
        ;;
      *)
        COMPREPLY=( $(compgen -W "--format --shell --ide --help -h" -- ${cur}) )
        return 0
        ;;
    esac
  fi

  # Flags for doctor command
  if [[ ${COMP_WORDS[1]} == "doctor" ]]; then
    COMPREPLY=( $(compgen -W "--help -h" -- ${cur}) )
    return 0
  fi

  # Flags for update command
  if [[ ${COMP_WORDS[1]} == "update" ]]; then
    COMPREPLY=( $(compgen -W "--force --beta --dev --help -h" -- ${cur}) )
    return 0
  fi

  # Flags for shell-completion command
  if [[ ${prev} == "--shell-completion" || ${prev} == "-sc" ]]; then
    COMPREPLY=( $(compgen -W "--bash --zsh --fish --powershell" -- ${cur}) )
    return 0
  fi

  return 0
}

# Register completion function
complete -F _ccs_completion ccs
