import fs from 'fs-extra';
import { basename, dirname, join } from 'path';
import globby from 'globby';
import type { BundlePaths } from './config';
import { resolvePackageDir } from './resolve-package-dir';

/**
 * Files that must exist on disk next to the bundle, because something reads them as *files* at
 * runtime rather than importing them.
 *
 * Almost all of these are read as `path.join(__dirname, '<name>')`. Inside the bundle `__dirname`
 * is always the bundle dir - one flat directory - so copying them there (flattened) is what makes
 * those reads resolve. A name collision between two such files would be a real bug, so `copyAssets`
 * reports one rather than silently overwriting.
 *
 * `pkg` is the owning package, `from` a glob **relative to that package's root**, `to` a directory
 * relative to the bundle dir. The package is resolved rather than assumed to sit at
 * `<packagesRoot>/node_modules/<pkg>`: under a capsule these all hoist to the capsule root, and the
 * previous repo-relative globs silently matched nothing there - which is invisible until a user hits
 * `bit init` or the typescript compiler at runtime.
 */
const ASSETS: Array<{ pkg: string; from: string; to: string; flatten?: boolean }> = [
  // the typescript aspect hands lib files to the compiler by path
  { pkg: 'typescript', from: 'lib/*.d.ts', to: '.', flatten: true },
  // `WorkspaceConfig.getTemplate` - the workspace.jsonc scaffold written by `bit init`
  { pkg: '@teambit/config', from: 'dist/workspace-template.jsonc', to: '.', flatten: true },
  // `HostInitializerMain.loadAgentsTemplate`
  { pkg: '@teambit/host-initializer', from: 'dist/agents-template*.md', to: '.', flatten: true },
  // McpConfigWriter's rules templates are no longer copied - `getDefaultRulesContent` inlines them
  // via esbuild's `.md` text loader instead (see `run-esbuild.ts`, gated on `BIT_IS_BUNDLE`).
  // the preview aspect's `generateLink` writes webpack entries that import
  // `<previewDistDir>/preview-modules.js` by absolute path, and `getPreviewDistDir` falls back to
  // `__dirname` (the bundle dir) when no bvm installation is around to resolve `@teambit/preview`
  // from. this dist file is self-contained (zero imports), so shipping it is all the env-template
  // webpack build (`GenerateEnvTemplate`) needs.
  { pkg: '@teambit/preview.modules.preview-modules', from: 'dist/preview-modules.js', to: '.', flatten: true },
];

async function copyOne(paths: BundlePaths, asset: (typeof ASSETS)[number], seen: Map<string, string>) {
  const packageDir = resolvePackageDir(paths.packagesRoot, asset.pkg);
  if (!packageDir) {
    // eslint-disable-next-line no-console
    console.warn(`[bundle] asset package "${asset.pkg}" is not resolvable from ${paths.packagesRoot}`);
    return 0;
  }
  const files = await globby(asset.from, { cwd: packageDir, dot: true });
  if (!files.length) {
    // eslint-disable-next-line no-console
    console.warn(`[bundle] asset pattern matched nothing: ${asset.pkg}/${asset.from}`);
    return 0;
  }
  await Promise.all(
    files.map(async (file) => {
      const target = join(paths.bundleDir, asset.to, asset.flatten ? basename(file) : file);
      const previous = seen.get(target);
      if (previous && previous !== file) {
        // eslint-disable-next-line no-console
        console.warn(`[bundle] asset collision at ${target}: "${previous}" is overwritten by "${file}"`);
      }
      seen.set(target, file);
      await fs.ensureDir(dirname(target));
      await fs.copy(join(packageDir, file), target, { dereference: true, overwrite: true });
    })
  );
  return files.length;
}

export async function copyAssets(paths: BundlePaths) {
  const seen = new Map<string, string>();
  const counts: number[] = [];
  // sequential: collision detection needs a deterministic order
  for (const asset of ASSETS) {
    // eslint-disable-next-line no-await-in-loop
    counts.push(await copyOne(paths, asset, seen));
  }
  return counts.reduce((a, b) => a + b, 0);
}
