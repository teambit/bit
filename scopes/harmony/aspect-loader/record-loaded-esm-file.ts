import { realpathSync } from 'fs';

/**
 * Records files loaded through dynamic `import()` so the dependency code that protects loaded
 * packages across installs can see them.
 *
 * CJS modules land in `require.cache`, which `preserve-loaded-virtual-store-dirs.ts` (in the pnpm
 * package manager) scans to keep virtual-store directories the running process loaded from
 * requireable when an install re-keys them to a new peer hash. ESM modules live in node's ESM
 * module map, which has no enumeration API - so the loaders record them here instead.
 *
 * The registry is a `Set<string>` of absolute file paths on `globalThis`, keyed with `Symbol.for`
 * rather than shared through an import: the reader lives in the pnpm package manager, which
 * aspect-loader must not depend on (the dependency runs the other way), and `Symbol.for` resolves
 * to the same key even when this module is duplicated in node_modules. The reader in
 * preserve-loaded-virtual-store-dirs.ts mirrors this contract - keep the two in sync.
 *
 * Only entry files are recorded, not their transitive static imports. That restores the entry's
 * own package directory - where an env's deferred imports and config-file reads point - but not
 * directories only ever reached through static imports of other packages; those are already fully
 * loaded into memory and are not re-read.
 */
const LOADED_ESM_FILES = Symbol.for('bit.loaded-esm-module-files');

export function recordLoadedEsmFile(filePath: string): void {
  try {
    const globalRecord = globalThis as { [LOADED_ESM_FILES]?: Set<string> };
    globalRecord[LOADED_ESM_FILES] ??= new Set<string>();
    globalRecord[LOADED_ESM_FILES].add(filePath);
    // record the realpath as well: virtual-store attribution needs the path inside .pnpm, and
    // callers may pass a path that reaches it through a node_modules symlink
    const real = realpathSync(filePath);
    if (real !== filePath) globalRecord[LOADED_ESM_FILES].add(real);
  } catch {
    // recording is best-effort; a missing file will fail at the import itself
  }
}
