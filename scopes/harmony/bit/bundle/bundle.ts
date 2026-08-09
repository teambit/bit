/* eslint-disable no-console */
import { bundleCli, DEFAULT_OUT_DIR } from '@teambit/harmony.modules.cli-bundler';
import { getAllCoreAspectsIds } from '../manifests';

/**
 * `npm run bundle` - the local iteration entry point.
 *
 * It holds no bundling logic: everything lives in `@teambit/harmony.modules.cli-bundler`, which the
 * `BundleCliApp` build task of `teambit.harmony/envs/bit-cli-app-env` uses as well. All this file
 * does is supply the two things only `@teambit/bit` knows: the core aspect ids, and that the
 * packages to bundle are the repo's own `node_modules`.
 */
function parseArgv(argv: string[]) {
  const get = (flag: string) => {
    const idx = argv.indexOf(flag);
    return idx === -1 ? undefined : argv[idx + 1];
  };
  return {
    outDir: get('--out-dir') || process.env.BIT_BUNDLE_OUT_DIR || DEFAULT_OUT_DIR,
    minify: argv.includes('--minify'),
    sourcemap: argv.includes('--sourcemap'),
    clean: !argv.includes('--no-clean'),
    sea: argv.includes('--sea'),
    uiBundling: argv.includes('--ui-bundling'),
  };
}

async function main() {
  const argv = parseArgv(process.argv.slice(2));
  const result = await bundleCli({
    packagesRoot: process.cwd(),
    coreAspectIds: getAllCoreAspectsIds(),
    ...argv,
  });
  console.log(`\n[bundle] done:\n${JSON.stringify(result, null, 2)}`);
  console.log(`\nnext:\n  cd ${result.outDir} && npm install\n  node ${result.outDir}/bin/bit --version`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
