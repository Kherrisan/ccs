const os = require('os');
const path = require('path');
const { stripTargetFlag } = require('../targets/target-resolver');
const { expandPath } = require('../utils/helpers');
const { fail } = require('../utils/ui');

process.env.CCS_INTERNAL_ENTRY_TARGET = 'codex';

function resolveCcsxpCodexHome() {
  const configuredHome = process.env.CCSXP_CODEX_HOME?.trim();
  if (configuredHome) {
    return path.resolve(expandPath(configuredHome));
  }

  return path.join(os.homedir(), '.codex');
}

process.env.CODEX_HOME = resolveCcsxpCodexHome();

// ccsxp is an opinionated shortcut for the built-in Codex-on-Codex route.
// Strip user-supplied target overrides before forcing the shortcut target.
const forwardedArgs = (() => {
  try {
    return stripTargetFlag(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(fail(message));
    process.exit(1);
  }
})();

process.argv.splice(2, process.argv.length - 2, 'codex', '--target', 'codex', ...forwardedArgs);
require('../ccs');
