import fs from 'fs-extra';
import path from 'path';
import type { Logger } from '@teambit/logger';
import { dirSpellings, loadedModuleFiles } from './loaded-module-files';

/**
 * Keeps packages the running process has loaded from a node_modules directory *other* than the
 * virtual store requireable across an install that relocates them.
 *
 * preserve-loaded-virtual-store-dirs.ts covers the same hazard for `node_modules/.pnpm/<slot>`,
 * where an install re-keys a slot by its peer hash. This module covers the other way a loaded
 * package's directory disappears: it was nested - in a root component's own node_modules, say - and
 * the install decided the copy hoisted higher up satisfies it, so it deleted the nested one. The
 * hoisted node linker does this routinely, and root components make it likely, since each root gets
 * its own node_modules whose contents shift as the dependency set settles between installs.
 *
 * The consequence is identical: node keeps the loaded module objects but not the files, so a
 * require the loaded code deferred past load time throws MODULE_NOT_FOUND. `@teambit/aspect` defers
 * `require('./babel/babel-config')` until `getCompiler()`, which the install flow itself calls right
 * after the package-manager run, so the install dies with `Cannot find module './babel/babel-config'`.
 * Envs are only the loudest case - this reaches any package loaded out of the workspace.
 *
 * The restore copies the package back from wherever node would resolve it now, walking the standard
 * node_modules chain up from the removed location. That donor is required to hold the same version:
 * the point is to keep serving the files belonging to the modules already in memory, and a
 * different version's files are not those. Best-effort throughout - a failure to restore leaves
 * things no worse than without this module.
 *
 * `reloadMovedEnvs` does not cover this. It only considers envs carrying a `__path`, which is set
 * when an env is registered through the plugin mechanism; an env registered by an aspect's provider
 * (`@teambit/aspect`'s, for one) has none and is skipped. Reloading is also not a substitute in
 * general: every reload path has to consult the registered env to do its work, and consulting it is
 * exactly what triggers the deferred require.
 */
export interface LoadedNestedPkgDir {
  /** absolute path of the package directory, e.g. <ws>/node_modules/.bit_roots/x/node_modules/@teambit/aspect */
  dirPath: string;
  /** the node_modules directory holding it, i.e. dirname(dirPath) less the scope segment */
  nodeModulesDir: string;
  /** name of the package the loaded modules belong to, e.g. "@teambit/aspect" */
  pkgName: string;
  /** the version in that directory at snapshot time - a donor must match it */
  version: string;
}

/**
 * the package directories under the workspace's node_modules, outside the virtual store, that back
 * loaded modules. Directories whose version cannot be read are left out: without it a donor cannot
 * be shown to hold the same files, and restoring a different version's files under a loaded
 * module's path is worse than leaving the path missing.
 */
export function snapshotLoadedNestedPkgDirs(rootDir: string): LoadedNestedPkgDir[] {
  const roots = dirSpellings(path.join(path.resolve(rootDir), 'node_modules')).map((dir) => `${dir}${path.sep}`);
  const byDirPath = new Map<string, LoadedNestedPkgDir>();
  for (const filename of loadedModuleFiles()) {
    const root = roots.find((prefix) => filename.startsWith(prefix));
    if (!root) continue;
    // the virtual store has its own preservation, which understands peer-hash re-keying
    if (filename.slice(root.length).split(path.sep)[0] === '.pnpm') continue;
    const pkg = parsePkgDir(filename);
    if (!pkg || byDirPath.has(pkg.dirPath)) continue;
    const version = readVersion(pkg.dirPath);
    if (!version) continue;
    byDirPath.set(pkg.dirPath, { ...pkg, version });
  }
  return [...byDirPath.values()];
}

/**
 * restore every snapshotted directory the install removed, copying it from the same version found
 * along the node_modules chain above where it used to be.
 *
 * restores run sequentially, deliberately: this sits right after every install, where the engine has
 * just saturated the disk, and each restore is a recursive copy. The common case is zero removed
 * directories (the checks are cheap), and when there are any, there are few - serial keeps the worst
 * case from piling unbounded deep copies on top of each other in constrained CI/container
 * environments.
 */
export async function restoreRemovedLoadedNestedPkgDirs(
  rootDir: string,
  snapshot: LoadedNestedPkgDir[],
  logger?: Logger
): Promise<void> {
  if (snapshot.length === 0) return;
  const removed: LoadedNestedPkgDir[] = [];
  for (const dir of snapshot) {
    // eslint-disable-next-line no-await-in-loop
    if (await isGone(dir.dirPath)) removed.push(dir);
  }
  if (removed.length === 0) return;
  const startTime = Date.now();
  let restored = 0;
  for (const dir of removed) {
    // eslint-disable-next-line no-await-in-loop
    if (await restoreOneDir(rootDir, dir, logger)) restored += 1;
  }
  logger?.debug(
    `preserve-loaded-nested-pkg-dirs: the install removed ${removed.length} loaded dir(s), restored ${restored} in ${
      Date.now() - startTime
    }ms`
  );
}

/**
 * whether nothing at all is at the path anymore. lstat rather than an existence check that follows
 * links: a symlink the install left pointing at something gone is still an entry occupying the path,
 * and writing "into" it would write through to the target rather than replace the link. Restoring
 * over one is the linker's business, not this module's, so a path that still holds anything counts
 * as kept.
 */
async function isGone(dirPath: string): Promise<boolean> {
  try {
    await fs.lstat(dirPath);
    return false;
  } catch {
    return true;
  }
}

/** restore one removed package directory from a same-version donor. returns whether a copy was made. */
async function restoreOneDir(rootDir: string, dir: LoadedNestedPkgDir, logger?: Logger): Promise<boolean> {
  const donorPath = await findDonorPath(rootDir, dir);
  if (!donorPath) {
    logger?.debug(
      `preserve-loaded-nested-pkg-dirs: ${dir.dirPath} was removed by the install and no ${dir.pkgName}@${dir.version} ` +
        `remains above it; modules loaded from it may fail deferred requires`
    );
    return false;
  }
  try {
    // dereference:false keeps the donor's own dependency links as links
    await fs.copy(donorPath, dir.dirPath, { dereference: false, overwrite: false, errorOnExist: false });
    logger?.debug(
      `preserve-loaded-nested-pkg-dirs: restored ${dir.dirPath} (loaded by this process, removed by the install) from ${donorPath}`
    );
    return true;
  } catch (err: any) {
    logger?.warn(`preserve-loaded-nested-pkg-dirs: failed restoring ${dir.dirPath}: ${err.message}`);
    return false;
  }
}

/** the first same-version copy of the package along the node_modules chain above the removed one */
async function findDonorPath(rootDir: string, dir: LoadedNestedPkgDir): Promise<string | undefined> {
  for (const candidate of resolutionCandidates(rootDir, dir)) {
    // eslint-disable-next-line no-await-in-loop
    if ((await readVersionAsync(candidate)) === dir.version) return candidate;
  }
  return undefined;
}

/**
 * where node would look for the package from the removed directory's location, nearest first, up to
 * the workspace root. Bounded there deliberately: above it lies bit's own installation, whose copy
 * of a package is not the workspace's to copy in. exported for tests.
 */
export function* resolutionCandidates(
  rootDir: string,
  { dirPath, nodeModulesDir, pkgName }: Pick<LoadedNestedPkgDir, 'dirPath' | 'nodeModulesDir' | 'pkgName'>
): Generator<string> {
  const stopAt = path.resolve(rootDir);
  let dir = path.dirname(nodeModulesDir);
  for (;;) {
    // an ancestor that is itself a node_modules holds packages, not package roots, so it is not a
    // place node would append another node_modules to
    if (path.basename(dir) !== 'node_modules') {
      const candidate = path.join(dir, 'node_modules', pkgName);
      if (candidate !== dirPath) yield candidate;
    }
    if (dir === stopAt) return;
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

/**
 * the package directory a loaded file belongs to: the `node_modules/<pkg>` prefix nearest the file.
 * The nearest one owns it - a package nested inside another package's node_modules is spelled with
 * both, and the deeper boundary is the one whose files these are. exported for tests.
 */
export function parsePkgDir(
  filename: string
): { dirPath: string; nodeModulesDir: string; pkgName: string } | undefined {
  const segments = filename.split(path.sep);
  const nmIndex = segments.lastIndexOf('node_modules');
  if (nmIndex === -1) return undefined;
  const first = segments[nmIndex + 1];
  if (!first) return undefined;
  // a scoped package is two segments; an unscoped one is a single segment that never starts with @
  const nameSegments = first.startsWith('@') ? segments.slice(nmIndex + 1, nmIndex + 3) : [first];
  if (nameSegments.length < 2 && first.startsWith('@')) return undefined;
  if (!nameSegments[nameSegments.length - 1]) return undefined;
  return {
    dirPath: segments.slice(0, nmIndex + 1 + nameSegments.length).join(path.sep),
    nodeModulesDir: segments.slice(0, nmIndex + 1).join(path.sep),
    pkgName: nameSegments.join('/'),
  };
}

/** the version in a package directory's manifest, or undefined if there is no readable one */
function readVersion(dirPath: string): string | undefined {
  try {
    const version = fs.readJsonSync(path.join(dirPath, 'package.json')).version;
    return typeof version === 'string' ? version : undefined;
  } catch {
    return undefined;
  }
}

async function readVersionAsync(dirPath: string): Promise<string | undefined> {
  try {
    const version = (await fs.readJson(path.join(dirPath, 'package.json'))).version;
    return typeof version === 'string' ? version : undefined;
  } catch {
    return undefined;
  }
}
