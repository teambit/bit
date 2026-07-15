/**
 * Prints the npm packages (name@version, space separated) of the pinned legacy core envs.
 *
 * Used by CI (see setup_harmony in .circleci/config.yml) to pre-warm the package-manager cache
 * that e2e nodes restore: many e2e suites configure components with these envs, and each install
 * pulls the env's full published dependency chain. Without a warm cache every parallel node pays
 * that download once (~10 minutes per node).
 *
 * Parses scopes/envs/envs/legacy-core-envs.ts (the source of truth) instead of requiring it,
 * since this may run before the repo is compiled.
 */

const fs = require('fs');
const path = require('path');

// pinned for back-compat but not exercised by the e2e suite - their (large) chains are not
// worth warming
const SKIP = new Set(['teambit.react/react-native', 'teambit.html/html']);

const sourceFile = path.join(__dirname, '..', 'scopes', 'envs', 'envs', 'legacy-core-envs.ts');
const source = fs.readFileSync(sourceFile, 'utf8');
const block = source.match(/LEGACY_CORE_ENVS_VERSIONS[^{]*\{([^}]*)\}/);
if (!block) throw new Error(`could not find LEGACY_CORE_ENVS_VERSIONS in ${sourceFile}`);
const entries = [...block[1].matchAll(/'([^']+)':\s*'([^']+)'/g)];
if (!entries.length) throw new Error(`no entries parsed from LEGACY_CORE_ENVS_VERSIONS in ${sourceFile}`);

const packages = entries
  .filter(([, envId]) => !SKIP.has(envId))
  .map(([, envId, version]) => {
    // same convention as getLegacyCoreEnvPackageName(): 'teambit.react/react' => '@teambit/react'
    const [, ...name] = envId.split('/');
    return `@teambit/${name.join('.')}@${version}`;
  });

console.log(packages.join(' '));
