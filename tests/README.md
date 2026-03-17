# CCS Test Suite

## Organization

```
tests/
├── unit/              # Module unit tests (Mocha)
│   ├── glmt/          # Legacy GLMT transformer/internal compatibility tests
│   └── delegation/    # Delegation module tests
├── npm/               # npm package tests (Mocha)
├── native/            # Native installation tests (bash/PowerShell)
│   ├── unix/          # Unix/Linux/macOS tests
│   └── windows/       # Windows PowerShell tests
├── integration/       # Integration + smoke tests
└── shared/            # Shared utilities
    ├── fixtures/      # Test configuration and environment
    ├── unit/          # Helper function tests
    ├── helpers.sh     # Bash test utilities
    └── test-data.js   # Test data for npm tests
```

## Running Tests

```bash
bun run test           # All automated tests (unit + integration + npm)
bun run test:unit      # Unit tests only
bun run test:npm       # npm package tests
bun run test:native    # Native Unix tests (bash)
```

## Test Categories

### Unit Tests (`unit/`)
Module-level tests using Mocha framework:
- `unit/glmt/` - Legacy transformer internals kept for Cursor translation compatibility
- `unit/delegation/` - Permission mode, session manager, result formatter

### npm Tests (`npm/`)
npm package functionality tests using Mocha:
- `postinstall.test.js` - Postinstall behavior
- `cli.test.js` - CLI argument parsing
- `cross-platform.test.js` - Cross-platform compatibility
- `special-commands.test.js` - Integration tests

### Native Tests (`native/`)
Installation tests for curl|bash (Unix) and irm|iex (Windows):
- `native/unix/edge-cases.sh` - Unix edge case tests
- `native/windows/edge-cases.ps1` - Windows edge case tests

### Integration Tests (`integration/`)
Integration and smoke coverage for scenarios that exercise multiple layers:
- Automated `*.test.ts` files run as part of `bun run test:all` and CI
- Shell and standalone probe scripts remain on-demand for targeted debugging
- `cursor-daemon-lifecycle.test.ts` - local daemon process + HTTP smoke coverage
- `image-analyzer-hook.test.ts` - hook integration coverage
- `glmt-integration-test.sh` - legacy GLMT compatibility smoke probe
- `symlink-chain-test.sh` - Symlink chain handling
- `ux-integration-test.sh` - CLI UX integration

## Adding New Tests

- **Unit tests**: Add to `unit/<module>/` for isolated module behavior
- **npm tests**: Add to `npm/` for package behavior
- **Native tests**: Add to `native/unix/` or `native/windows/`
- **Integration tests**: Add automated cross-layer smoke coverage to `integration/*.test.ts`
