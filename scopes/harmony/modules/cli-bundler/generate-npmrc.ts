import { ensureDirSync, writeFileSync } from 'fs-extra';
import { join } from 'path';

/**
 * `legacy-peer-deps` is deliberate, not a workaround for a bug we should fix here. The externals are
 * a *curated slice* of a dependency tree that pnpm already resolved successfully in this repo - the
 * versions pinned in `package.json` are the exact ones the bundle was built and tested against.
 * Re-resolving them with npm's strict peer algorithm re-litigates a decision that has already been
 * made, and fails on stale peer ranges such as `@teambit/api-reference.hooks.use-api` still asking
 * for react ^16 || ^17 while the workspace is on react 19.
 */
const CONTENT = ['@teambit:registry=https://node-registry.bit.cloud', 'legacy-peer-deps=true', ''].join('\n');

export function generateNpmrc(rootOutDir: string) {
  ensureDirSync(rootOutDir);
  writeFileSync(join(rootOutDir, '.npmrc'), CONTENT);
}
