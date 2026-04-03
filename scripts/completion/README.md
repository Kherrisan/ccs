# Shell Completion for CCS

Tab completion for CCS commands, subcommands, profiles, and flags.

The completion scripts are thin adapters over the hidden `ccs __complete` backend so
all supported shells stay aligned with the same command graph.

**Supported Shells:** Bash, Zsh, Fish, PowerShell

## Features

- Complete profile names (both settings-based and account-based)
- Complete root commands, help topics, provider shortcuts, and command flags
- Complete `ccs auth` and `ccs api` lifecycle subcommands
- Context-aware: suggests relevant options based on current command

## Quick Install (Recommended)

```bash
ccs --shell-completion
```

This will:
- Auto-detect your shell
- Copy completion files to `~/.ccs/completions/`
- Configure your shell profile with proper comment markers
- Show instructions to activate

**Manual shell selection:**
```bash
ccs --shell-completion --bash        # Force bash
ccs --shell-completion --zsh         # Force zsh
ccs --shell-completion --fish        # Force fish
ccs --shell-completion --powershell  # Force PowerShell
```

**Help and verification:**
```bash
ccs help completion
ccs --shell-completion --force
```

## Manual Installation

Completion files are installed to `~/.ccs/completions/` during `npm install`.

### Bash

Add to `~/.bashrc` or `~/.bash_profile`:

```bash
# CCS shell completion
source ~/.ccs/completions/ccs.bash
```

Then reload:
```bash
source ~/.bashrc
```

### Zsh

1. Create completion directory:
   ```zsh
   mkdir -p ~/.zsh/completion
   ```

2. Copy completion file:
   ```zsh
   cp ~/.ccs/completions/ccs.zsh ~/.zsh/completion/_ccs
   ```

3. Add to `~/.zshrc`:
   ```zsh
   # CCS shell completion
   fpath=(~/.zsh/completion $fpath)
   autoload -Uz compinit && compinit
   ```

4. Reload:
   ```zsh
   source ~/.zshrc
   ```

### PowerShell

Add to your PowerShell profile (`$PROFILE`):

```powershell
# CCS shell completion
. "$HOME\.ccs\completions\ccs.ps1"
```

Then reload:
```powershell
. $PROFILE
```

### Fish

**User installation (recommended)**

Fish automatically loads completions from `~/.config/fish/completions/`:

```fish
# Create completion directory if it doesn't exist
mkdir -p ~/.config/fish/completions

# Copy completion script
cp scripts/completion/ccs.fish ~/.config/fish/completions/
```

That's it! Fish will automatically load the completion on demand. No need to source or reload.

**System-wide installation (requires sudo)**

```fish
sudo cp scripts/completion/ccs.fish /usr/share/fish/vendor_completions.d/
```

## Usage Examples

### Basic Completion

```bash
$ ccs <TAB>
auth      api       cliproxy  config    doctor    docker    help

$ ccs help <TAB>
profiles  providers  completion  targets
```

### Context Completion

```bash
$ ccs auth show <TAB>
work      personal  team      --json

$ ccs api <TAB>
create    list      discover  copy    export  import  remove
```

### Backend Contract

```bash
$ ccs __complete --shell bash --current do
doctor
docker
```

Shell adapters now call the shared CCS completion backend instead of maintaining their own
copy of the command graph. That means:
- top-level commands, help topics, and provider shortcuts come from CCS itself
- dynamic profiles and CLIProxy variants resolve through the real config loaders
- bash, zsh, fish, and PowerShell stay aligned with the same completion logic

## Troubleshooting

### Bash

1. Check if completion is loaded:
   ```bash
   complete -p ccs
   ```
2. Verify the backend directly:
   ```bash
   ccs __complete --shell bash --current "" -- help
   ```

### Zsh

1. Verify completion system is enabled:
   ```zsh
   autoload -Uz compinit && compinit
   ```
2. Rebuild the cache if needed:
   ```zsh
   rm ~/.zcompdump && compinit
   ```
3. Verify the backend directly:
   ```zsh
   ccs __complete --shell zsh --current "" -- help
   ```

### PowerShell

1. Check that the profile exists:
   ```powershell
   Test-Path $PROFILE
   ```
2. Verify the backend directly:
   ```powershell
   ccs __complete --shell powershell --current "" -- help
   ```

### Fish

1. Verify completion file location:
   ```fish
   ls ~/.config/fish/completions/ccs.fish
   ```
2. Test completion manually:
   ```fish
   complete -C'ccs '
   ```
3. Verify the backend directly:
   ```fish
   ccs __complete --shell fish --current "" -- help
   ```

## Technical Details

- Bash uses `complete -F`
- Zsh uses a custom `_ccs` completion function
- Fish uses `complete -a` with backend command substitution
- PowerShell uses `Register-ArgumentCompleter`
- All four shells now delegate suggestion logic to `ccs __complete`

## Contributing

When adding or changing command surfaces:
1. Update the shared TypeScript command/completion catalog
2. Run `bun run validate`
3. Smoke-check at least one installed shell adapter plus the backend directly

## See Also

- [CCS Documentation](https://github.com/kaitranntt/ccs)
- [Bash Programmable Completion](https://www.gnu.org/software/bash/manual/html_node/Programmable-Completion.html)
- [Zsh Completion System](http://zsh.sourceforge.net/Doc/Release/Completion-System.html)
- [Fish Completion Tutorial](https://fishshell.com/docs/current/completions.html)
- [PowerShell Argument Completers](https://docs.microsoft.com/en-us/powershell/module/microsoft.powershell.core/register-argumentcompleter)
