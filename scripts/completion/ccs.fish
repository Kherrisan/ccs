# Fish completion for CCS (Claude Code Switch)
# Compatible with fish 3.0+
#
# Features:
#   - Categorized completions with [cmd], [proxy], [model], and [account] prefixes
#   - Dynamic profile loading from config.json and profiles.json
#   - Context-aware subcommand completion
#
# Installation:
#   Copy to ~/.config/fish/completions/:
#     mkdir -p ~/.config/fish/completions
#     cp scripts/completion/ccs.fish ~/.config/fish/completions/
#
#   Fish will automatically load completions from this directory.
#   No need to source or reload - completions are loaded on demand.

# Helper function to get settings profiles
function __fish_ccs_get_settings_profiles
    set -l config_path ~/.ccs/config.json

    if test -f $config_path
        jq -r '.profiles | keys[]' $config_path 2>/dev/null
    end
end

# Helper function to get custom/unknown settings profiles
function __fish_ccs_get_custom_settings_profiles
    set -l config_path ~/.ccs/config.json
    set -l known_profiles default glm kimi

    if test -f $config_path
        set -l all_profiles (jq -r '.profiles | keys[]' $config_path 2>/dev/null)

        for profile in $all_profiles
            if not contains $profile $known_profiles
                echo $profile
            end
        end
    end
end

# Helper function to get cliproxy variants
function __fish_ccs_get_cliproxy_variants
    set -l config_path ~/.ccs/config.json

    if test -f $config_path
        jq -r '.cliproxy | keys[]' $config_path 2>/dev/null
    end
end

# Helper function to get profiles with all types
function __fish_ccs_get_profiles
    __fish_ccs_get_settings_profiles
    __fish_ccs_get_account_profiles
end

# Helper function to get account profiles only
function __fish_ccs_get_account_profiles
    set -l profiles_path ~/.ccs/profiles.json

    if test -f $profiles_path
        jq -r '.profiles | keys[]' $profiles_path 2>/dev/null
    end
end

# Helper function to check if we're in auth context
function __fish_ccs_using_auth
    __fish_seen_subcommand_from auth
end

# Helper function to check specific auth subcommand
function __fish_ccs_using_auth_subcommand
    set -l subcommand $argv[1]
    __fish_ccs_using_auth; and __fish_seen_subcommand_from $subcommand
end

# Helper function to check if we're in api context
function __fish_ccs_using_api
    __fish_seen_subcommand_from api
end

# Helper function to check specific api subcommand
function __fish_ccs_using_api_subcommand
    set -l subcommand $argv[1]
    __fish_ccs_using_api; and __fish_seen_subcommand_from $subcommand
end

# Helper function to check if we're in cliproxy context
function __fish_ccs_using_cliproxy
    __fish_seen_subcommand_from cliproxy
end

# Helper function to check specific cliproxy subcommand
function __fish_ccs_using_cliproxy_subcommand
    set -l subcommand $argv[1]
    __fish_ccs_using_cliproxy; and __fish_seen_subcommand_from $subcommand
end

# Helper function to check if we're in profile context
function __fish_ccs_using_profile
    __fish_seen_subcommand_from profile
end

# Helper function to check specific profile subcommand
function __fish_ccs_using_profile_subcommand
    set -l subcommand $argv[1]
    __fish_ccs_using_profile; and __fish_seen_subcommand_from $subcommand
end

# Helper function to check if we're using a CLIProxy provider
function __fish_ccs_using_provider
    __fish_seen_subcommand_from gemini codex agy qwen
end

# Disable file completion for ccs
complete -c ccs -f

# Top-level flags
complete -c ccs -s h -l help -d 'Show help message'
complete -c ccs -s v -l version -d 'Show version information'
complete -c ccs -s sc -l shell-completion -d 'Install shell completion'

# Commands - grouped with [cmd] prefix for visual distinction
complete -c ccs -n 'not __fish_seen_subcommand_from auth api cliproxy doctor env sync update gemini codex agy qwen' -a 'auth' -d '[cmd] Manage multiple Claude accounts'
complete -c ccs -n 'not __fish_seen_subcommand_from auth api cliproxy doctor env sync update gemini codex agy qwen' -a 'api' -d '[cmd] Manage API profiles (create/remove)'
complete -c ccs -n 'not __fish_seen_subcommand_from auth api cliproxy doctor env sync update gemini codex agy qwen' -a 'cliproxy' -d '[cmd] Manage CLIProxy variants and binary'
complete -c ccs -n 'not __fish_seen_subcommand_from auth api cliproxy doctor env sync update gemini codex agy qwen' -a 'doctor' -d '[cmd] Run health check and diagnostics'
complete -c ccs -n 'not __fish_seen_subcommand_from auth api cliproxy doctor env sync update gemini codex agy qwen' -a 'env' -d '[cmd] Export env vars for third-party tools'
complete -c ccs -n 'not __fish_seen_subcommand_from auth api cliproxy doctor env sync update gemini codex agy qwen' -a 'sync' -d '[cmd] Sync delegation commands and skills'
complete -c ccs -n 'not __fish_seen_subcommand_from auth api cliproxy doctor env sync update gemini codex agy qwen' -a 'update' -d '[cmd] Update CCS to latest version'

# CLIProxy profiles - grouped with [proxy] prefix for OAuth providers
complete -c ccs -n 'not __fish_seen_subcommand_from auth api cliproxy doctor env sync update gemini codex agy qwen' -a 'gemini' -d '[proxy] Google Gemini (OAuth)'
complete -c ccs -n 'not __fish_seen_subcommand_from auth api cliproxy doctor env sync update gemini codex agy qwen' -a 'codex' -d '[proxy] OpenAI Codex (OAuth)'
complete -c ccs -n 'not __fish_seen_subcommand_from auth api cliproxy doctor env sync update gemini codex agy qwen' -a 'agy' -d '[proxy] Antigravity (OAuth)'
complete -c ccs -n 'not __fish_seen_subcommand_from auth api cliproxy doctor env sync update gemini codex agy qwen' -a 'qwen' -d '[proxy] Qwen Code (OAuth)'

# Model profiles - grouped with [model] prefix for visual distinction
complete -c ccs -n 'not __fish_seen_subcommand_from auth api cliproxy doctor env sync update gemini codex agy qwen' -a 'default' -d '[model] Default Claude Sonnet 4.5'
complete -c ccs -n 'not __fish_seen_subcommand_from auth api cliproxy doctor env sync update gemini codex agy qwen' -a 'glm' -d '[model] GLM-4.6 (cost-optimized)'
complete -c ccs -n 'not __fish_seen_subcommand_from auth api cliproxy doctor env sync update gemini codex agy qwen' -a 'kimi' -d '[model] Kimi for Coding (long-context)'

# Custom model profiles - dynamic with [model] prefix
complete -c ccs -n 'not __fish_seen_subcommand_from auth api cliproxy doctor env sync update gemini codex agy qwen' -a '(__fish_ccs_get_custom_settings_profiles)' -d '[model] Settings-based profile'

# CLIProxy variants - dynamic with [variant] prefix
complete -c ccs -n 'not __fish_seen_subcommand_from auth api cliproxy doctor env sync update gemini codex agy qwen' -a '(__fish_ccs_get_cliproxy_variants)' -d '[variant] CLIProxy variant'

# Account profiles - dynamic with [account] prefix
complete -c ccs -n 'not __fish_seen_subcommand_from auth api cliproxy doctor env sync update gemini codex agy qwen' -a '(__fish_ccs_get_account_profiles)' -d '[account] Account-based profile'

# shell-completion subflags
complete -c ccs -n '__fish_seen_argument -l shell-completion; or __fish_seen_argument -s sc' -l bash -d 'Install for bash'
complete -c ccs -n '__fish_seen_argument -l shell-completion; or __fish_seen_argument -s sc' -l zsh -d 'Install for zsh'
complete -c ccs -n '__fish_seen_argument -l shell-completion; or __fish_seen_argument -s sc' -l fish -d 'Install for fish'
complete -c ccs -n '__fish_seen_argument -l shell-completion; or __fish_seen_argument -s sc' -l powershell -d 'Install for PowerShell'

# CLIProxy provider flags (gemini, codex, agy, qwen)
complete -c ccs -n '__fish_ccs_using_provider' -l auth -d 'Authenticate only'
complete -c ccs -n '__fish_ccs_using_provider' -l config -d 'Change model configuration'
complete -c ccs -n '__fish_ccs_using_provider' -l logout -d 'Clear authentication'
complete -c ccs -n '__fish_ccs_using_provider' -l headless -d 'Headless auth (for SSH)'
complete -c ccs -n '__fish_ccs_using_provider' -s h -l help -d 'Show help'

# update command flags
complete -c ccs -n '__fish_seen_subcommand_from update' -l force -d 'Force reinstall current version'
complete -c ccs -n '__fish_seen_subcommand_from update' -l beta -d 'Install from dev channel'
complete -c ccs -n '__fish_seen_subcommand_from update' -l dev -d 'Install from dev channel'
complete -c ccs -n '__fish_seen_subcommand_from update' -s h -l help -d 'Show help'

# doctor command flags
complete -c ccs -n '__fish_seen_subcommand_from doctor' -s h -l help -d 'Show help for doctor command'

# env command completions
complete -c ccs -n '__fish_seen_subcommand_from env; and not __fish_seen_argument -l format -l shell' -a 'gemini codex agy qwen iflow kiro ghcp claude' -d '[proxy] CLIProxy profile'
complete -c ccs -n '__fish_seen_subcommand_from env' -l format -d 'Output format'
complete -c ccs -n '__fish_seen_subcommand_from env; and __fish_seen_argument -l format' -a 'openai anthropic raw' -d 'Format'
complete -c ccs -n '__fish_seen_subcommand_from env' -l shell -d 'Shell syntax'
complete -c ccs -n '__fish_seen_subcommand_from env; and __fish_seen_argument -l shell' -a 'auto bash zsh fish powershell' -d 'Shell'
complete -c ccs -n '__fish_seen_subcommand_from env' -s h -l help -d 'Show help for env command'

# ============================================================================
# auth subcommands
# ============================================================================
complete -c ccs -n '__fish_ccs_using_auth; and not __fish_seen_subcommand_from create list show remove default' -a 'create' -d 'Create new profile and login'
complete -c ccs -n '__fish_ccs_using_auth; and not __fish_seen_subcommand_from create list show remove default' -a 'list' -d 'List all saved profiles'
complete -c ccs -n '__fish_ccs_using_auth; and not __fish_seen_subcommand_from create list show remove default' -a 'show' -d 'Show profile details'
complete -c ccs -n '__fish_ccs_using_auth; and not __fish_seen_subcommand_from create list show remove default' -a 'remove' -d 'Remove saved profile'
complete -c ccs -n '__fish_ccs_using_auth; and not __fish_seen_subcommand_from create list show remove default' -a 'default' -d 'Set default profile'

complete -c ccs -n '__fish_ccs_using_auth' -s h -l help -d 'Show help for auth commands'
complete -c ccs -n '__fish_ccs_using_auth_subcommand create' -l force -d 'Allow overwriting existing profile'
complete -c ccs -n '__fish_ccs_using_auth_subcommand list' -l verbose -d 'Show additional details'
complete -c ccs -n '__fish_ccs_using_auth_subcommand list' -l json -d 'Output in JSON format'
complete -c ccs -n '__fish_ccs_using_auth_subcommand show' -a '(__fish_ccs_get_account_profiles)' -d 'Account profile'
complete -c ccs -n '__fish_ccs_using_auth_subcommand show' -l json -d 'Output in JSON format'
complete -c ccs -n '__fish_ccs_using_auth_subcommand remove' -a '(__fish_ccs_get_account_profiles)' -d 'Account profile'
complete -c ccs -n '__fish_ccs_using_auth_subcommand remove' -l yes -d 'Skip confirmation prompts'
complete -c ccs -n '__fish_ccs_using_auth_subcommand remove' -s y -d 'Skip confirmation prompts'
complete -c ccs -n '__fish_ccs_using_auth_subcommand default' -a '(__fish_ccs_get_account_profiles)' -d 'Account profile'

# ============================================================================
# api subcommands
# ============================================================================
complete -c ccs -n '__fish_ccs_using_api; and not __fish_seen_subcommand_from create list remove' -a 'create' -d 'Create new API profile'
complete -c ccs -n '__fish_ccs_using_api; and not __fish_seen_subcommand_from create list remove' -a 'list' -d 'List all API profiles'
complete -c ccs -n '__fish_ccs_using_api; and not __fish_seen_subcommand_from create list remove' -a 'remove' -d 'Remove an API profile'

complete -c ccs -n '__fish_ccs_using_api' -s h -l help -d 'Show help for api commands'
complete -c ccs -n '__fish_ccs_using_api_subcommand create' -l base-url -d 'API base URL'
complete -c ccs -n '__fish_ccs_using_api_subcommand create' -l api-key -d 'API key'
complete -c ccs -n '__fish_ccs_using_api_subcommand create' -l model -d 'Default model'
complete -c ccs -n '__fish_ccs_using_api_subcommand create' -l force -d 'Overwrite existing profile'
complete -c ccs -n '__fish_ccs_using_api_subcommand create' -l yes -d 'Skip prompts'
complete -c ccs -n '__fish_ccs_using_api_subcommand create' -s y -d 'Skip prompts'
complete -c ccs -n '__fish_ccs_using_api_subcommand remove' -a '(__fish_ccs_get_settings_profiles)' -d 'Settings profile'
complete -c ccs -n '__fish_ccs_using_api_subcommand remove' -l yes -d 'Skip confirmation'
complete -c ccs -n '__fish_ccs_using_api_subcommand remove' -s y -d 'Skip confirmation'

# ============================================================================
# cliproxy subcommands
# ============================================================================
complete -c ccs -n '__fish_ccs_using_cliproxy; and not __fish_seen_subcommand_from create list remove' -a 'create' -d 'Create new CLIProxy variant'
complete -c ccs -n '__fish_ccs_using_cliproxy; and not __fish_seen_subcommand_from create list remove' -a 'list' -d 'List all CLIProxy variants'
complete -c ccs -n '__fish_ccs_using_cliproxy; and not __fish_seen_subcommand_from create list remove' -a 'remove' -d 'Remove a CLIProxy variant'

complete -c ccs -n '__fish_ccs_using_cliproxy' -s h -l help -d 'Show help for cliproxy commands'
complete -c ccs -n '__fish_ccs_using_cliproxy' -l install -d 'Install specific version'
complete -c ccs -n '__fish_ccs_using_cliproxy' -l latest -d 'Install latest version'
complete -c ccs -n '__fish_ccs_using_cliproxy_subcommand create' -l provider -d 'Provider name'
complete -c ccs -n '__fish_ccs_using_cliproxy_subcommand create; and __fish_seen_argument -l provider' -a 'gemini codex agy qwen' -d 'Provider'
complete -c ccs -n '__fish_ccs_using_cliproxy_subcommand create' -l model -d 'Model name'
complete -c ccs -n '__fish_ccs_using_cliproxy_subcommand create' -l force -d 'Overwrite existing variant'
complete -c ccs -n '__fish_ccs_using_cliproxy_subcommand create' -l yes -d 'Skip prompts'
complete -c ccs -n '__fish_ccs_using_cliproxy_subcommand create' -s y -d 'Skip prompts'
complete -c ccs -n '__fish_ccs_using_cliproxy_subcommand remove' -a '(__fish_ccs_get_cliproxy_variants)' -d 'CLIProxy variant'
complete -c ccs -n '__fish_ccs_using_cliproxy_subcommand remove' -l yes -d 'Skip confirmation'
complete -c ccs -n '__fish_ccs_using_cliproxy_subcommand remove' -s y -d 'Skip confirmation'

# ============================================================================
# profile subcommands (legacy - redirects to api)
# ============================================================================
complete -c ccs -n '__fish_ccs_using_profile; and not __fish_seen_subcommand_from create list remove' -a 'create' -d 'Create new API profile'
complete -c ccs -n '__fish_ccs_using_profile; and not __fish_seen_subcommand_from create list remove' -a 'list' -d 'List all profiles'
complete -c ccs -n '__fish_ccs_using_profile; and not __fish_seen_subcommand_from create list remove' -a 'remove' -d 'Remove a profile'

complete -c ccs -n '__fish_ccs_using_profile' -s h -l help -d 'Show help for profile commands'
complete -c ccs -n '__fish_ccs_using_profile_subcommand create' -l base-url -d 'API base URL'
complete -c ccs -n '__fish_ccs_using_profile_subcommand create' -l api-key -d 'API key'
complete -c ccs -n '__fish_ccs_using_profile_subcommand create' -l model -d 'Default model'
complete -c ccs -n '__fish_ccs_using_profile_subcommand create' -l force -d 'Overwrite existing profile'
complete -c ccs -n '__fish_ccs_using_profile_subcommand create' -l yes -d 'Skip prompts'
complete -c ccs -n '__fish_ccs_using_profile_subcommand create' -s y -d 'Skip prompts'
complete -c ccs -n '__fish_ccs_using_profile_subcommand remove' -a '(__fish_ccs_get_settings_profiles)' -d 'Settings profile'
complete -c ccs -n '__fish_ccs_using_profile_subcommand remove' -l yes -d 'Skip confirmation'
complete -c ccs -n '__fish_ccs_using_profile_subcommand remove' -s y -d 'Skip confirmation'
