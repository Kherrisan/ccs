# Fish completion for CCS (Claude Code Switch)

function __fish_ccs_complete
    set -l tokens_before_current (commandline -opc)
    if test (count $tokens_before_current) -gt 0
        set -e tokens_before_current[1]
    end

    set -l current (commandline -ct)
    if test -n "$current"; and test (count $tokens_before_current) -gt 0; and test "$tokens_before_current[-1]" = "$current"
        set -e tokens_before_current[-1]
    end

    set -l script_file (status filename)
    set -l repo_root (realpath (dirname $script_file)/../.. 2>/dev/null)
    set -l repo_cli "$repo_root/dist/ccs.js"
    if not test -f "$repo_cli"
        set repo_cli "$repo_root/bin/ccs.js"
    end
    if test -f "$repo_cli"
        node "$repo_cli" __complete --shell fish --current "$current" -- $tokens_before_current 2>/dev/null
        return
    end

    if command -sq ccs
        ccs __complete --shell fish --current "$current" -- $tokens_before_current 2>/dev/null
    end
end

complete -c ccs -f -a "(__fish_ccs_complete)"
