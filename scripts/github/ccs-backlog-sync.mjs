import { runSync } from './ccs-backlog-sync-lib.mjs';

runSync().catch((error) => {
  console.error(error);
  process.exit(1);
});
