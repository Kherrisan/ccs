#compdef ccs

# Zsh completion for CCS (Claude Code Switch)
# Compatible with zsh 5.0+
#
# Installation:
#   Add to ~/.zshrc:
#     fpath=(~/.zsh/completion $fpath)
#     autoload -Uz compinit && compinit
#     source /path/to/ccs/scripts/completion/ccs.zsh
#
#   Or install system-wide:
#     sudo cp scripts/completion/ccs.zsh /usr/local/share/zsh/site-functions/_ccs

# Set up completion styles for better formatting and colors
zstyle ':completion:*:*:ccs:*:commands' list-colors '=(#b)(auth|api|cliproxy|doctor|env|sync|update)([[:space:]]#--[[:space:]]#*)==0\;34=2\;37'
zstyle ':completion:*:*:ccs:*:proxy-profiles' list-colors '=(#b)(gemini|codex|agy|qwen)([[:space:]]#--[[:space:]]#*)==0\;35=2\;37'
zstyle ':completion:*:*:ccs:*:model-profiles' list-colors '=(#b)(default|glm|kimi|[^[:space:]]##)([[:space:]]#--[[:space:]]#*)==0\;32=2\;37'
zstyle ':completion:*:*:ccs:*:account-profiles' list-colors '=(#b)([^[:space:]]##)([[:space:]]#--[[:space:]]#*)==0\;33=2\;37'
zstyle ':completion:*:*:ccs:*' group-name ''
zstyle ':completion:*:*:ccs:*:descriptions' format $'\n%B%F{yellow}── %d ──%f%b'
zstyle ':completion:*:*:ccs:*' list-separator '  --  '
zstyle ':completion:*:*:ccs:*' list-rows-first true
zstyle ':completion:*:*:ccs:*' menu select

_ccs() {
  local -a commands proxy_profiles settings_profiles_described account_profiles_described cliproxy_variants_described
  local curcontext="$curcontext" state line
  typeset -A opt_args

  # Define top-level commands
  commands=(
    'auth:Manage multiple Claude accounts'
    'api:Manage API profiles (create/remove)'
    'cliproxy:Manage CLIProxy variants and binary'
    'doctor:Run health check and diagnostics'
    'env:Export env vars for third-party tools'
    'sync:Sync delegation commands and skills'
    'update:Update CCS to latest version'
  )

  # Define CLIProxy hardcoded profiles (OAuth providers)
  proxy_profiles=(
    'gemini:Google Gemini (OAuth)'
    'codex:OpenAI Codex (OAuth)'
    'agy:Antigravity (OAuth)'
    'qwen:Qwen Code (OAuth)'
    'iflow:iFlow (OAuth)'
    'kiro:Kiro (OAuth)'
    'ghcp:GitHub Copilot (OAuth)'
    'claude:Claude Direct (OAuth)'
  )

  # Define known settings profiles with descriptions
  local -A profile_descriptions
  profile_descriptions=(
    'default' 'Default Claude Sonnet 4.5'
    'glm'     'GLM-4.6 (cost-optimized)'
    'kimi'    'Kimi for Coding (long-context)'
  )

  # Load settings-based profiles from config.json
  if [[ -f ~/.ccs/config.json ]]; then
    local -a raw_settings_profiles
    raw_settings_profiles=(${(f)"$(jq -r '.profiles | keys[]' ~/.ccs/config.json 2>/dev/null)"})

    for profile in $raw_settings_profiles; do
      local desc="${profile_descriptions[$profile]:-Settings-based profile}"
      settings_profiles_described+=("${profile}:${desc}")
    done
  fi

  # Load account-based profiles from profiles.json
  if [[ -f ~/.ccs/profiles.json ]]; then
    local -a raw_account_profiles
    raw_account_profiles=(${(f)"$(jq -r '.profiles | keys[]' ~/.ccs/profiles.json 2>/dev/null)"})

    for profile in $raw_account_profiles; do
      account_profiles_described+=("${profile}:Account-based profile")
    done
  fi

  # Load cliproxy variants from config.json
  if [[ -f ~/.ccs/config.json ]]; then
    local -a raw_cliproxy_variants
    raw_cliproxy_variants=(${(f)"$(jq -r '.cliproxy | keys[]' ~/.ccs/config.json 2>/dev/null)"})

    for variant in $raw_cliproxy_variants; do
      cliproxy_variants_described+=("${variant}:CLIProxy variant")
    done
  fi

  _arguments -C \
    '(- *)'{-h,--help}'[Show help message]' \
    '(- *)'{-v,--version}'[Show version information]' \
    '(- *)'{-sc,--shell-completion}'[Install shell completion]' \
    '1: :->command' \
    '*:: :->args'

  case $state in
    command)
      _describe -t commands 'commands' commands
      _describe -t proxy-profiles 'CLIProxy profiles' proxy_profiles
      _describe -t model-profiles 'model profiles' settings_profiles_described
      _describe -t account-profiles 'account profiles' account_profiles_described
      _describe -t cliproxy-variants 'CLIProxy variants' cliproxy_variants_described
      ;;

    args)
      case $words[1] in
        auth)
          _ccs_auth
          ;;
        api)
          _ccs_api
          ;;
        cliproxy)
          _ccs_cliproxy
          ;;
        update)
          _arguments \
            '--force[Force reinstall current version]' \
            '--beta[Install from dev channel]' \
            '--dev[Install from dev channel]' \
            '(- *)'{-h,--help}'[Show help]'
          ;;
        doctor)
          _arguments \
            '(- *)'{-h,--help}'[Show help for doctor command]'
          ;;
        env)
          _arguments \
            '--format[Output format]:format:(openai anthropic raw)' \
            '--shell[Shell syntax]:shell:(auto bash zsh fish powershell)' \
            '(- *)'{-h,--help}'[Show help]' \
            '1:profile:($proxy_profiles ${(k)settings_profiles_described})'
          ;;
        gemini|codex|agy|qwen)
          _arguments \
            '--auth[Authenticate only]' \
            '--config[Change model configuration]' \
            '--logout[Clear authentication]' \
            '--headless[Headless auth (for SSH)]' \
            '(- *)'{-h,--help}'[Show help]'
          ;;
        --shell-completion|-sc)
          _arguments \
            '--bash[Install for bash]' \
            '--zsh[Install for zsh]' \
            '--fish[Install for fish]' \
            '--powershell[Install for PowerShell]'
          ;;
        *)
          _message 'Claude CLI arguments'
          ;;
      esac
      ;;
  esac
}

_ccs_api() {
  local curcontext="$curcontext" state line
  typeset -A opt_args

  local -a api_commands settings_profiles

  api_commands=(
    'create:Create new API profile (interactive)'
    'list:List all API profiles'
    'remove:Remove an API profile'
  )

  if [[ -f ~/.ccs/config.json ]]; then
    settings_profiles=(${(f)"$(jq -r '.profiles | keys[]' ~/.ccs/config.json 2>/dev/null)"})
  fi

  _arguments -C \
    '(- *)'{-h,--help}'[Show help for api commands]' \
    '1: :->subcommand' \
    '*:: :->subargs'

  case $state in
    subcommand)
      _describe -t api-commands 'api commands' api_commands
      ;;

    subargs)
      case $words[1] in
        create)
          _arguments \
            '1:profile name:' \
            '--base-url[API base URL]:url:' \
            '--api-key[API key]:key:' \
            '--model[Default model]:model:' \
            '--force[Overwrite existing profile]' \
            {--yes,-y}'[Skip prompts]'
          ;;
        list)
          ;;
        remove|delete|rm)
          _arguments \
            '1:profile:($settings_profiles)' \
            {--yes,-y}'[Skip confirmation]'
          ;;
      esac
      ;;
  esac
}

_ccs_cliproxy() {
  local curcontext="$curcontext" state line
  typeset -A opt_args

  local -a cliproxy_commands cliproxy_variants providers

  cliproxy_commands=(
    'create:Create new CLIProxy variant profile'
    'list:List all CLIProxy variant profiles'
    'remove:Remove a CLIProxy variant profile'
  )

  providers=(gemini codex agy qwen)

  if [[ -f ~/.ccs/config.json ]]; then
    cliproxy_variants=(${(f)"$(jq -r '.cliproxy | keys[]' ~/.ccs/config.json 2>/dev/null)"})
  fi

  _arguments -C \
    '(- *)'{-h,--help}'[Show help for cliproxy commands]' \
    '--install[Install specific version]:version:' \
    '--latest[Install latest version]' \
    '1: :->subcommand' \
    '*:: :->subargs'

  case $state in
    subcommand)
      _describe -t cliproxy-commands 'cliproxy commands' cliproxy_commands
      ;;

    subargs)
      case $words[1] in
        create)
          _arguments \
            '1:variant name:' \
            '--provider[Provider name]:provider:($providers)' \
            '--model[Model name]:model:' \
            '--force[Overwrite existing variant]' \
            {--yes,-y}'[Skip prompts]'
          ;;
        list|ls)
          ;;
        remove|delete|rm)
          _arguments \
            '1:variant:($cliproxy_variants)' \
            {--yes,-y}'[Skip confirmation]'
          ;;
      esac
      ;;
  esac
}

_ccs_auth() {
  local curcontext="$curcontext" state line
  typeset -A opt_args

  local -a auth_commands account_profiles

  auth_commands=(
    'create:Create new profile and login'
    'list:List all saved profiles'
    'show:Show profile details'
    'remove:Remove saved profile'
    'default:Set default profile'
  )

  if [[ -f ~/.ccs/profiles.json ]]; then
    account_profiles=(${(f)"$(jq -r '.profiles | keys[]' ~/.ccs/profiles.json 2>/dev/null)"})
  fi

  _arguments -C \
    '(- *)'{-h,--help}'[Show help for auth commands]' \
    '1: :->subcommand' \
    '*:: :->subargs'

  case $state in
    subcommand)
      _describe -t auth-commands 'auth commands' auth_commands
      ;;

    subargs)
      case $words[1] in
        create)
          _message 'new profile name'
          _arguments '--force[Allow overwriting existing profile]'
          ;;
        list)
          _arguments \
            '--verbose[Show additional details]' \
            '--json[Output in JSON format]'
          ;;
        show)
          _arguments \
            '1:profile:($account_profiles)' \
            '--json[Output in JSON format]'
          ;;
        remove)
          _arguments \
            '1:profile:($account_profiles)' \
            {--yes,-y}'[Skip confirmation prompts]'
          ;;
        default)
          _arguments '1:profile:($account_profiles)'
          ;;
      esac
      ;;
  esac
}

_ccs "$@"
