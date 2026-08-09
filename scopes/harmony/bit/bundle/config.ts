import { join } from 'path';

/**
 * All the paths the bundler writes to / reads from.
 *
 * The output is intentionally placed *outside* the repo (default `/tmp/bit-bundle`), so testing the
 * bundle can never accidentally resolve something from the repo's `node_modules`.
 */
export type BundlePaths = {
  /** the repo root (the bit workspace we're bundling from) */
  repoRoot: string;
  /** the root of the produced distribution. this whole dir is what would be shipped */
  rootOutDir: string;
  /** `<rootOutDir>/bundle` - the actual esbuild output + the on-disk assets it needs */
  bundleDir: string;
  /** basename of the bundle file, e.g. `bit.app.js` */
  appFileName: string;
  /** absolute path of the bundle file */
  appFilePath: string;
  /** where the generated esbuild entry + barrels are written (inside the repo's node_modules, so
   * that `@teambit/*` resolves from them without any extra configuration) */
  generatedDir: string;
};

export const DEFAULT_OUT_DIR = '/tmp/bit-bundle';
export const BUNDLE_DIR_NAME = 'bundle';
export const APP_FILE_BASE_NAME = 'bit.app';

export function getBundlePaths(repoRoot: string, outDir = DEFAULT_OUT_DIR): BundlePaths {
  const rootOutDir = outDir;
  const bundleDir = join(rootOutDir, BUNDLE_DIR_NAME);
  const appFileName = `${APP_FILE_BASE_NAME}.js`;
  return {
    repoRoot,
    rootOutDir,
    bundleDir,
    appFileName,
    appFilePath: join(bundleDir, appFileName),
    generatedDir: join(repoRoot, 'node_modules', '.bit-bundle'),
  };
}
