import fs from 'fs-extra';
import path from 'path';
import type { Logger } from '@teambit/logger';

/**
 * Keeps packages the running process has loaded from `node_modules/.pnpm` requireable across an
 * install that relocates them.
 *
 * pnpm keys a virtual-store directory by the package's peer-resolution hash, so an install that
 * changes the dependency set gives the same name@version a NEW directory and deletes the one this
 * process loaded its modules from. Node keeps the loaded module objects, but not the files - so any
 * require the loaded code deferred past load time resolves against the deleted directory and throws
 * MODULE_NOT_FOUND. Any package loaded out of the workspace's own virtual store is exposed to this,
 * and an env is the worst case: `@teambit/aspect`, for instance, defers
 * `require('./babel/babel-config')` until `getCompiler()` is called - which the install flow itself
 * does right after the package-manager run, when it compiles components and reloads envs. The whole
 * install then dies with `Cannot find module './babel/babel-config'`.
 *
 * Replacing the in-memory instances instead is not an option: every reload path (reloadMovedEnvs,
 * loading components as aspects) has to consult the registered env to do its work, and consulting
 * it is exactly what throws. So the fix follows the same rule an OS applies to a running binary's
 * deleted files: what the process has loaded stays available for the process's lifetime. The
 * snapshot records which virtual-store directories back modules in `require.cache`; after the
 * install, any of them that vanished is restored from its re-keyed twin - same name@version, new
 * peer hash - whose package content is identical (it comes from the same tarball; the peer set only
 * affects the dependency symlinks alongside it, which are relative and stay valid from the restored
 * location). A differently patched twin is not such a donor and `findDonorDirName` excludes it.
 *
 * The restored directory is intentionally absent from the lockfile. `pnpmPruneModules` skips
 * directories that back `require.cache` entries for the same reason this module exists, and a later
 * command's prune - whose process has nothing loaded from it - removes it.
 *
 * CJS modules are found in `require.cache`. ESM modules live in node's ESM module map, which has
 * no enumeration API, so aspect-loader records every file it loads through dynamic `import()` in a
 * `Symbol.for`-keyed global set (see aspect-loader's record-loaded-esm-file.ts, the writer side of
 * this contract - keep the two in sync; a symbol rather than an import because the dependency
 * between these packages runs the other way). For ESM only entry files are recorded, not their
 * transitive static imports - those are fully loaded into memory and are not re-read, while an
 * entry's own package directory, where deferred imports and config-file reads point, is restored
 * wholly.
 */
const LOADED_ESM_FILES = Symbol.for('bit.loaded-esm-module-files');

function loadedModuleFiles(): string[] {
  return [...Object.keys(require.cache), ...recordedEsmFiles()];
}

/**
 * the ESM loads aspect-loader recorded. the contract is a global under a well-known symbol, so it
 * is held by convention rather than by types and anything could occupy the key - a value that is
 * not a set of paths is treated as absent rather than allowed to throw, since this runs inside
 * every install and prune, where CJS preservation still works without it.
 */
function recordedEsmFiles(): string[] {
  const recorded = (globalThis as { [LOADED_ESM_FILES]?: unknown })[LOADED_ESM_FILES] as
    | Iterable<unknown>
    | undefined;
  if (!recorded || typeof recorded[Symbol.iterator] !== 'function') return [];
  return [...recorded].filter((file): file is string => typeof file === 'string');
}

/**
 * the spellings of the virtual store that loaded module paths can start with: the given one and its
 * realpath. node resolves a module's filename through its realpath, so the require.cache keys for a
 * workspace reached through a symlink - the normal case on macOS, where a temp dir under /var is
 * really under /private/var - are spelled differently from the rootDir the install was handed.
 * Comparing against the given spelling alone would match nothing there and silently turn the whole
 * preservation into a no-op. The given spelling is kept too, for --preserve-symlinks.
 */
function virtualStoreDirSpellings(virtualStoreDir: string): string[] {
  const resolved = path.resolve(virtualStoreDir);
  let real: string;
  try {
    real = fs.realpathSync(resolved);
  } catch {
    return [resolved]; // not there yet (a first install, a lockfile-only run) - nothing is loaded from it either
  }
  return real === resolved ? [resolved] : [resolved, real];
}

/**
 * the loaded module files (require.cache plus the recorded ESM loads) that live under the given
 * virtual store, as the spelling of the store each one matched plus the path segments below it.
 */
function* loadedFilesUnderVirtualStore(virtualStoreDir: string): Generator<{ storeDir: string; segments: string[] }> {
  const stores = virtualStoreDirSpellings(virtualStoreDir).map((dir) => ({ dir, prefix: `${dir}${path.sep}` }));
  for (const filename of loadedModuleFiles()) {
    const store = stores.find(({ prefix }) => filename.startsWith(prefix));
    if (!store) continue;
    yield { storeDir: store.dir, segments: filename.slice(store.prefix.length).split(path.sep) };
  }
}

export interface LoadedVirtualStoreDir {
  /** directory name directly under node_modules/.pnpm, e.g. "@teambit+aspect@1.0.1042_<peers>" */
  dirName: string;
  /** absolute path of that directory */
  dirPath: string;
  /** name of the package the cached modules belong to, e.g. "@teambit/aspect" */
  pkgName: string;
}

/**
 * the virtual-store directories currently backing loaded modules (require.cache plus the recorded
 * ESM loads), with the package each one holds. require.cache keys are realpaths, and the ESM
 * recorder stores realpaths alongside the given spellings, so a module reached through a
 * dependency symlink is attributed to the directory that really owns it.
 */
export function snapshotLoadedVirtualStoreDirs(rootDir: string): LoadedVirtualStoreDir[] {
  const virtualStoreDir = path.join(path.resolve(rootDir), 'node_modules', '.pnpm');
  const byDirName = new Map<string, LoadedVirtualStoreDir>();
  for (const { storeDir, segments } of loadedFilesUnderVirtualStore(virtualStoreDir)) {
    const dirName = segments[0];
    if (!dirName) continue;
    const pkgName = parsePkgName(segments);
    if (!pkgName) continue;
    // a slot also holds its dependencies, as symlinks under the same node_modules. a path that kept
    // such a spelling instead of being realpathed (--preserve-symlinks, or an ESM load recorded by
    // the name it was given) names the dependency, not the package the slot is keyed by - and a
    // slot attributed to the wrong package finds no donor and never gets restored. prefer whichever
    // loaded path names the owner, whatever order the paths arrive in; keep a non-owner attribution
    // only as a fallback, for a slot named after something other than <pkg>@<version> (a tarball or
    // git dependency), where no path can match and a restore was never possible anyway.
    const previous = byDirName.get(dirName);
    if (previous && (isSlotOfPkg(previous.dirName, previous.pkgName) || !isSlotOfPkg(dirName, pkgName))) continue;
    // the dir is spelled the way the file that revealed it was, so the later existence check and
    // restore address the same directory node reached the loaded module through
    byDirName.set(dirName, { dirName, dirPath: path.join(storeDir, dirName), pkgName });
  }
  return [...byDirName.values()];
}

/**
 * restore every snapshotted directory the install removed, copying it from a directory holding the
 * same name@version under a different peer hash. best-effort: a failure to restore leaves things no
 * worse than without this module.
 *
 * restores run sequentially, deliberately: this sits right after every install, where the engine
 * has just saturated the disk, and each restore is a recursive copy. the common case is zero
 * removed directories (the checks are cheap), and when there are any, there are few - serial
 * keeps the worst case from piling unbounded deep copies on top of each other in constrained
 * CI/container environments.
 */
export async function restoreRemovedLoadedVirtualStoreDirs(
  snapshot: LoadedVirtualStoreDir[],
  logger?: Logger
): Promise<void> {
  if (snapshot.length === 0) return;
  const removed: LoadedVirtualStoreDir[] = [];
  for (const dir of snapshot) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await fs.pathExists(dir.dirPath))) removed.push(dir);
  }
  if (removed.length === 0) return;
  const startTime = Date.now();
  const virtualStoreDir = path.dirname(removed[0].dirPath);
  let currentDirs: string[];
  try {
    currentDirs = await fs.readdir(virtualStoreDir);
  } catch {
    return; // no virtual store left (e.g. hoisted install) - nothing to restore from
  }
  let restored = 0;
  for (const dir of removed) {
    // eslint-disable-next-line no-await-in-loop
    if (await restoreOneDir(dir, virtualStoreDir, currentDirs, logger)) restored += 1;
  }
  logger?.debug(
    `preserve-loaded-virtual-store-dirs: the install removed ${removed.length} loaded dir(s), restored ${restored} in ${
      Date.now() - startTime
    }ms`
  );
}

/** restore one removed directory from a same-version donor. returns whether a copy was made. */
async function restoreOneDir(
  { dirName, dirPath, pkgName }: LoadedVirtualStoreDir,
  virtualStoreDir: string,
  currentDirs: string[],
  logger?: Logger
): Promise<boolean> {
  const donorDirName = findDonorDirName(dirName, pkgName, currentDirs);
  if (!donorDirName) {
    logger?.debug(
      `preserve-loaded-virtual-store-dirs: ${dirName} was removed by the install and no same-version donor exists; ` +
        `modules loaded from it may fail deferred requires`
    );
    return false;
  }
  const donorPath = path.join(virtualStoreDir, donorDirName);
  try {
    // guard against a donor that does not actually hold the package's files
    if (!(await fs.pathExists(path.join(donorPath, 'node_modules', pkgName)))) return false;
    // dereference:false keeps the donor's dependency symlinks as symlinks; they are relative
    // (../<other-dir>/node_modules/<dep>) and stay valid from the restored location.
    await fs.copy(donorPath, dirPath, { dereference: false, overwrite: false, errorOnExist: false });
    logger?.debug(
      `preserve-loaded-virtual-store-dirs: restored ${dirName} (loaded by this process, removed by the install) from ${donorDirName}`
    );
    return true;
  } catch (err: any) {
    logger?.warn(`preserve-loaded-virtual-store-dirs: failed restoring ${dirName}: ${err.message}`);
    return false;
  }
}

/**
 * the directory names under the given virtual store that back loaded modules (require.cache plus
 * the recorded ESM loads). used by pnpmPruneModules to leave alone what the running process is
 * using.
 */
export function loadedVirtualStoreDirNames(virtualStoreDir: string): Set<string> {
  const dirNames = new Set<string>();
  for (const { segments } of loadedFilesUnderVirtualStore(virtualStoreDir)) {
    if (segments[0]) dirNames.add(segments[0]);
  }
  return dirNames;
}

/**
 * a directory holding the same name@version as the missing one, under a different peer hash.
 * exported for tests.
 *
 * the version is read off the missing directory's own name rather than parsed structurally: the
 * name is `<escaped-pkg-name>@<version>[_<suffix>]` where the escaped name (\/ replaced by +) is
 * known exactly, and `_` cannot appear in a semver version, so everything between the name's `@`
 * and the first `_` after it is the version.
 *
 * a donor is only equivalent if it holds the same files. differing peer sets do not affect them -
 * they only change the sibling dependency symlinks - but a patch does, and pnpm encodes one in the
 * same suffix as a `patch_hash=<hash>` segment. so a patched directory is never a donor for an
 * unpatched one or for one patched differently: without the check, the process would go on reading
 * files that do not match the modules it already loaded.
 */
export function findDonorDirName(missingDirName: string, pkgName: string, currentDirs: string[]): string | undefined {
  if (!isSlotOfPkg(missingDirName, pkgName)) return undefined;
  const namePrefix = slotNamePrefix(pkgName);
  const version = missingDirName.slice(namePrefix.length).split('_')[0];
  const exact = `${namePrefix}${version}`;
  const wantedPatch = patchHashOf(missingDirName, exact);
  return currentDirs.find(
    (dir) =>
      dir !== missingDirName &&
      (dir === exact || dir.startsWith(`${exact}_`)) &&
      patchHashOf(dir, exact) === wantedPatch
  );
}

/** how a virtual-store dir name for the given package begins: the name with `/` escaped to `+` */
function slotNamePrefix(pkgName: string): string {
  return `${pkgName.replace(/\//g, '+')}@`;
}

/** whether the given virtual-store dir is the slot of the given package rather than of another */
function isSlotOfPkg(dirName: string, pkgName: string): boolean {
  return dirName.startsWith(slotNamePrefix(pkgName));
}

/** the patch a virtual-store dir name encodes in the suffix following `<name>@<version>`, if any */
function patchHashOf(dirName: string, namePlusVersion: string): string | undefined {
  return dirName.slice(namePlusVersion.length).match(/(?:^|_)patch_hash=([^_]+)/)?.[1];
}

/** the package name owning a file at .pnpm/<dir>/node_modules/<pkgName>/..., or undefined */
function parsePkgName(relativeSegments: string[]): string | undefined {
  // relativeSegments: [<dirName>, 'node_modules', <segment>, ...]
  if (relativeSegments[1] !== 'node_modules') return undefined;
  const first = relativeSegments[2];
  if (!first) return undefined;
  if (first.startsWith('@')) {
    const second = relativeSegments[3];
    return second ? `${first}/${second}` : undefined;
  }
  return first;
}
