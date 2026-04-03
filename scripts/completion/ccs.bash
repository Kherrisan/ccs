# Bash completion for CCS (Claude Code Switch)
# Compatible with bash 3.2+

_ccs_completion() {
  local cur
  COMPREPLY=()
  cur="${COMP_WORDS[COMP_CWORD]}"

  local tokens_before_current=()
  if [[ ${COMP_CWORD} -gt 1 ]]; then
    tokens_before_current=("${COMP_WORDS[@]:1:COMP_CWORD-1}")
  fi

  while IFS= read -r line; do
    [[ -n "${line}" ]] && COMPREPLY+=("${line}")
  done < <(__ccs_completion_run "${cur}" "${tokens_before_current[@]}")

  return 0
}

__ccs_completion_run() {
  local current="$1"
  shift || true

  local script_dir repo_root repo_cli
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  repo_root="$(cd "${script_dir}/../.." && pwd)"
  repo_cli="${repo_root}/dist/ccs.js"
  if [[ ! -f "${repo_cli}" ]]; then
    repo_cli="${repo_root}/bin/ccs.js"
  fi
  if [[ -f "${repo_cli}" ]]; then
    node "${repo_cli}" __complete --shell bash --current "${current}" -- "$@" 2>/dev/null
    return 0
  fi

  if command -v ccs >/dev/null 2>&1; then
    ccs __complete --shell bash --current "${current}" -- "$@" 2>/dev/null
  fi
}

complete -F _ccs_completion ccs
