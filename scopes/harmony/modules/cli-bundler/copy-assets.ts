import fs from 'fs-extra';
import { basename, dirname, join } from 'path';
import globby from 'globby';
import type { BundlePaths } from './config';

/**
 * Files that must exist on disk next to the bundle, because something reads them as *files* at
 * runtime rather than importing them.
 *
 * Almost all of these are read as `path.join(__dirname, '<name>')`. Inside the bundle `__dirname`
 * is always the bundle dir - one flat directory - so copying them there (flattened) is what makes
 * those reads resolve. A name collision between two such files would be a real bug, so `copyAssets`
 * reports one rather than silently overwriting.
 *
 * `from` is a glob relative to the repo root, `to` a directory relative to the bundle dir.
 */
const ASSETS: Array<{ from: string; to: string; flatten?: boolean }> = [
  // the typescript aspect hands lib files to the compiler by path
  { from: 'node_modules/typescript/lib/*.d.ts', to: '.', flatten: true },
  // `WorkspaceConfig.getTemplate` - the workspace.jsonc scaffold written by `bit init`
  { from: 'node_modules/@teambit/config/dist/workspace-template.jsonc', to: '.', flatten: true },
  // `HostInitializerMain.loadAgentsTemplate`
  { from: 'node_modules/@teambit/host-initializer/dist/agents-template*.md', to: '.', flatten: true },
  // `McpConfigWriter.loadRulesTemplate`
  { from: 'node_modules/@teambit/mcp.mcp-config-writer/dist/bit-*-template.md', to: '.', flatten: true },
];

async function copyOne(paths: BundlePaths, asset: (typeof ASSETS)[number], seen: Map<string, string>) {
  const files = await globby(asset.from, { cwd: paths.packagesRoot, dot: true });
  if (!files.length) {
    // eslint-disable-next-line no-console
    console.warn(`[bundle] asset pattern matched nothing: ${asset.from}`);
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
      await fs.copy(join(paths.packagesRoot, file), target, { dereference: true, overwrite: true });
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
