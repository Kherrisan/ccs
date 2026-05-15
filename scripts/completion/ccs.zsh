#compdef ccs

# Zsh completion for CCS (Claude Code Switch)

_ccs() {
  local current
  current="${words[CURRENT]}"

  local -a tokens_before_current
  if (( CURRENT > 2 )); then
    tokens_before_current=("${words[@]:2:$((CURRENT-2))}")
  else
    tokens_before_current=()
  fi

  local -a suggestions
  suggestions=("${(@f)$(__ccs_completion_run "${current}" "${tokens_before_current[@]}")}")
  compadd -- "${suggestions[@]}"
}

__ccs_completion_run() {
  local current="$1"
  shift || true

  local script_path script_dir repo_root repo_cli
  script_path="${(%):-%N}"
  script_dir="${script_path:A:h}"
  repo_root="${script_dir:h:h}"
  repo_cli="${repo_root}/dist/ccs.js"
  if [[ ! -f "${repo_cli}" ]]; then
    repo_cli="${repo_root}/bin/ccs.js"
  fi
  if [[ -f "${repo_cli}" ]]; then
    node "${repo_cli}" __complete --shell zsh --current "${current}" -- "$@" 2>/dev/null
    return 0
  fi

  if (( $+commands[ccs] )); then
    ccs __complete --shell zsh --current "${current}" -- "$@" 2>/dev/null
  fi
}
