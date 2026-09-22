import fs from 'fs-extra';
import path from 'path';

/**
 * The files this process has already loaded modules from.
 *
 * CJS modules are found in `require.cache`. ESM modules live in node's ESM module map, which has no
 * enumeration API, so aspect-loader records every file it loads through dynamic `import()` in a
 * `Symbol.for`-keyed global set (see aspect-loader's record-loaded-esm-file.ts, the writer side of
 * this contract - keep the two in sync; a symbol rather than an import because the dependency
 * between these packages runs the other way). For ESM only entry files are recorded, not their
 * transitive static imports - those are fully loaded into memory and are not re-read, while an
 * entry's own package directory, where deferred imports and config-file reads point, is preserved
 * wholly by the consumers of this list.
 */
const LOADED_ESM_FILES = Symbol.for('bit.loaded-esm-module-files');

export function loadedModuleFiles(): string[] {
  return [...Object.keys(require.cache), ...recordedEsmFiles()];
}

/**
 * the ESM loads aspect-loader recorded. the contract is a global under a well-known symbol, so it
 * is held by convention rather than by types and anything could occupy the key - a value that is
 * not a set of paths is treated as absent rather than allowed to throw, since this runs inside
 * every install and prune, where CJS preservation still works without it.
 */
function recordedEsmFiles(): string[] {
  const recorded = (globalThis as { [LOADED_ESM_FILES]?: unknown })[LOADED_ESM_FILES] as Iterable<unknown> | undefined;
  if (!recorded || typeof recorded[Symbol.iterator] !== 'function') return [];
  return [...recorded].filter((file): file is string => typeof file === 'string');
}

/**
 * the spellings of a directory that loaded module paths can start with: the given one and its
 * realpath. node resolves a module's filename through its realpath, so the require.cache keys for a
 * workspace reached through a symlink - the normal case on macOS, where a temp dir under /var is
 * really under /private/var - are spelled differently from the rootDir the install was handed.
 * Comparing against the given spelling alone would match nothing there and silently turn the whole
 * preservation into a no-op. The given spelling is kept too, for --preserve-symlinks.
 */
export function dirSpellings(dir: string): string[] {
  const resolved = path.resolve(dir);
  let real: string;
  try {
    real = fs.realpathSync(resolved);
  } catch {
    return [resolved]; // not there yet (a first install, a lockfile-only run) - nothing is loaded from it either
  }
  return real === resolved ? [resolved] : [resolved, real];
}
