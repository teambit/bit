/**
 * Make a workspace's privately hoisted dependencies resolvable from pnpm's global virtual store.
 *
 * Under the project-local virtual store, a package in `node_modules/.pnpm` resolves anything it
 * requires without declaring it by walking *up* into the workspace - the hoisted
 * `node_modules/.pnpm/node_modules` first, then the workspace root. Under the global virtual
 * store the package lives in a store shared with every other project on the machine, with no
 * workspace above it, so every such require fails.
 *
 * This covers phantom dependencies generally, not one class of them. Bit's core aspects are the
 * case that motivated it - `@teambit/*` is required by every published env and aspect without
 * being declared, because it has to be the single copy from the running installation - but any
 * under-declared package in the graph resolves the same way, which is why whole directories go on
 * the path rather than a hand-picked list.
 *
 * Both directories the walk reached are restored ({@link hoistedResolutionDirs}), because they
 * hold disjoint sets: pnpm hoists only *non-direct* dependencies, so a direct dependency of the
 * root - the workspace's own `mocha`, `react`, `@types/react` - is reachable through the root's
 * `node_modules` and nowhere else.
 *
 * pnpm's answer for this layout is `NODE_PATH` pointing at the hoisted directory, which stays
 * project-local under the global virtual store. pnpm sets it in the command shims it writes, but
 * bit runs from bvm rather than through a shim and loads aspects in its own process, so it has to
 * do this itself. `NODE_PATH` only covers CommonJS; an ESM loader (adapted from pnpm's
 * `@pnpm/plugin-esm-node-path`, MIT) handles the ESM side, registered both in-process via
 * `module.register` and for child processes via a `NODE_OPTIONS --import` flag. TypeScript reads
 * neither, so the type-resolution half lives in `@teambit/typescript` and builds its `paths` from
 * the same directories.
 *
 * Two call sites, and both matter:
 * - `bootstrap()` in `@teambit/bit`, before any aspect loads, gated on the layout the last
 *   install recorded ({@link isGlobalVirtualStoreLayout}). It deep-requires this module's dist
 *   file directly so CLI startup never pays for the dependency-resolver barrel.
 * - the install flow, right after the package manager finishes: the first install that switches
 *   a workspace onto the global virtual store runs with `bootstrap`'s gate still reflecting the
 *   old layout, yet the same process goes on to reload envs and compile from store slots. The
 *   installer re-applies the bridge the moment the target layout is known.
 *
 * Everything here is idempotent, so calling it again is always safe: `NODE_PATH` is rebuilt to the
 * same value, the ESM loader re-registers only when the ordered entry list changes, and the
 * process's own `NODE_OPTIONS` flag is replaced rather than stacked.
 *
 * One asymmetry to know about when reading the ESM half. Node runs the *last* registered loader
 * first and it delegates through `defaultResolve` before its own fallback, so an earlier
 * registration resolves anything it can before a later one is consulted. A re-registration
 * therefore corrects what child processes inherit - the `--import` flag carries the current list -
 * while in-process the earlier registration keeps its precedence for the entries it already had.
 * That only diverges from CommonJS for a specifier resolvable from more than one entry across two
 * registrations with different orders, which needs a process bridging two roots in alternating
 * order; the CommonJS half, rebuilt on every call, is always right.
 */
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

/**
 * Source of the registered ESM loader, with the resolution entries injected at registration time.
 * The entries cannot be read from `NODE_PATH` inside the loader: on modern Node the hooks run on
 * a separate thread whose `process.env` is a snapshot taken at registration, so late additions -
 * an install switching the workspace onto the global virtual store mid-process - would never be
 * seen. Injecting the list makes each registration self-contained, at the cost of needing a new
 * registration whenever the list changes - by order as much as by membership, since the loader
 * searches these entries in the order given.
 */
const esmNodePathLoaderSource = (dirs: string[]) => `
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const extraNodePaths = ${JSON.stringify(dirs)}

export async function resolve (specifier, context, defaultResolve) {
  try {
    return await defaultResolve(specifier, context, defaultResolve)
  } catch (originalError) {
    // Only bare specifiers can come from the hoisted directory; the rest are already anchored.
    // Windows absolute (drive-letter) and UNC paths are path specifiers too.
    if (
      specifier.startsWith('.') ||
      specifier.startsWith('/') ||
      specifier.startsWith('node:') ||
      specifier.startsWith('\\\\') ||
      /^[a-zA-Z]:[\\\\/]/.test(specifier)
    ) {
      throw originalError
    }
    // createRequire anchored inside the entry searches the entry itself: Node skips appending
    // /node_modules to a directory already named node_modules, and the parent step re-yields it
    // (.pnpm -> .pnpm/node_modules). Exact for the entries this loader exists for, both of which
    // are named node_modules; an entry not named node_modules would be searched one level deeper
    // than CommonJS NODE_PATH does - those entries are already covered by the CommonJS side and
    // are not ours to fix.
    for (const basePath of extraNodePaths) {
      try {
        const require = createRequire(pathToFileURL(basePath + '/').href)
        return { url: pathToFileURL(require.resolve(specifier)).href, shortCircuit: true }
      } catch {}
    }
    throw originalError
  }
}
`;

let lastRegisteredEntries: string | undefined;
let lastImportFlag: string | undefined;

/**
 * The `virtualStoreDir` pnpm recorded in a `node_modules/.modules.yaml`, or undefined when the
 * manifest records none.
 *
 * Current pnpm writes this manifest as JSON (YAML 1.2 being a superset of it), so the structured
 * read is a plain `JSON.parse` - no dependency, and correct for every value the writer can emit.
 * Older versions wrote block YAML, which the line match handles. A full YAML parser is
 * deliberately avoided: this runs in `bootstrap`, before any command does its work, and parsing
 * the whole manifest costs ~40ms on this repo's own 415KB one against ~0.2ms for the line match
 * (the manifest carries the entire hoisted alias map, so it grows with the dependency graph).
 * Taking a package dependency here would also make the earliest, least recoverable step of CLI
 * startup depend on module resolution - the very thing this module exists to repair.
 */
export function parseRecordedVirtualStoreDir(modulesManifest: string): string | undefined {
  try {
    const parsed = JSON.parse(modulesManifest) as { virtualStoreDir?: unknown };
    return typeof parsed.virtualStoreDir === 'string' ? parsed.virtualStoreDir : undefined;
  } catch {
    // not JSON - a block-YAML manifest from an older pnpm
  }
  return modulesManifest.match(/^\s*"?virtualStoreDir"?:\s*"?([^"\n]+?)"?,?\s*$/m)?.[1];
}

/**
 * Whether the workspace's last install used pnpm's global virtual store, judged by the
 * `virtualStoreDir` the engine records in `node_modules/.modules.yaml`: `.pnpm` (or any path
 * inside the workspace) means project-local; a path escaping the workspace means the global
 * store. No manifest or no recorded value reads as project-local - a workspace that never
 * installed under the global store has nothing to bridge.
 */
/**
 * Platform-safe path containment: `path.relative` is case-insensitive on Windows (where the
 * filesystem is) and case-sensitive on posix, which a bare `startsWith` prefix check gets wrong
 * for drive-letter casing differences between realpath results and given spellings. Equality
 * counts as inside - every caller asks "does this path escape that root", and a path equal to
 * the root has not escaped it.
 */
export function isPathInsideOrEqual(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  // component-aware traversal check: a child legitimately named `..foo` also starts with `..`
  return !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`);
}

/**
 * Whether two spellings name the same directory. `path.relative` normalizes both sides first, so a
 * trailing separator, a redundant `.`, a relative spelling and - on Windows - a difference in case
 * all compare equal, which string equality would miss. Anything written by hand into `NODE_PATH`
 * arrives in whatever spelling its author chose.
 */
export function isSamePath(one: string, other: string): boolean {
  return path.relative(one, other) === '';
}

export function isGlobalVirtualStoreLayout(workspaceRoot: string): boolean {
  let modulesManifest: string;
  try {
    modulesManifest = fs.readFileSync(path.join(workspaceRoot, 'node_modules', '.modules.yaml'), 'utf8');
  } catch {
    return false;
  }
  const virtualStoreDir = parseRecordedVirtualStoreDir(modulesManifest);
  if (!virtualStoreDir) return false;
  let workspaceRealpath = workspaceRoot;
  try {
    workspaceRealpath = fs.realpathSync(workspaceRoot);
  } catch {
    // fall back to the given spelling
  }
  const resolved = path.resolve(workspaceRealpath, 'node_modules', virtualStoreDir);
  let storeRealpath = resolved;
  try {
    storeRealpath = fs.realpathSync(resolved);
  } catch {
    // dangling recorded dir - judge by the lexical resolution
  }
  return !isPathInsideOrEqual(storeRealpath, workspaceRealpath);
}

/**
 * The root of the installation this module runs from: the nearest ancestor that owns a
 * `node_modules/.modules.yaml`. For a bvm-installed bit that is the bvm version directory; for a
 * workspace-provided bit it is the workspace.
 *
 * Two candidate starting points, because Node realpaths module filenames: under the global
 * virtual store this module's `__dirname` is the *store slot* - a dead end with no
 * `.modules.yaml` and no physical path back to the installation. The entry script's
 * `process.argv[1]` is the path *as invoked*, unresolved through symlinks, so for a store-linked
 * installation it still sits inside the installation tree. `__dirname` remains the fallback for
 * setups that invoke bit through a resolved path (and for the copy-shaped installations where it
 * works fine). `undefined` when neither leads to an installation (e.g. running from source).
 */
export function selfInstallationRoot(): string | undefined {
  const candidates = [process.argv[1], __dirname].filter(Boolean) as string[];
  for (const candidate of candidates) {
    let dir = path.dirname(path.resolve(candidate));
    for (;;) {
      if (fs.existsSync(path.join(dir, 'node_modules', '.modules.yaml'))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return undefined;
}

/**
 * Bridge the *running installation's* own directories when that installation is itself linked to
 * the global virtual store - its packages then live in store slots and their phantom requires
 * need the installation's private hoist exactly like a workspace's do. Judged by the same
 * `.modules.yaml` record, read at the installation root. A conventional project-local
 * installation (bvm's default) reads project-local and stays unbridged, so nothing changes for
 * it or for the processes it spawns.
 */
export function ensureSelfInstallationBridge(): void {
  const installationRoot = selfInstallationRoot();
  if (!installationRoot) return;
  if (!isGlobalVirtualStoreLayout(installationRoot)) return;
  ensureHoistedDependencyResolution(installationRoot);
}

/**
 * The directories a package resolved from `<root>` used to reach by walking up, in the order the
 * walk reached them: the hoisted `node_modules/.pnpm/node_modules` first, then the root's own
 * `node_modules`. Both are lost under the global virtual store, and they hold disjoint sets -
 * pnpm hoists only *non-direct* dependencies, so a direct dependency of the root exists solely in
 * the second. Missing directories are dropped; a root with neither yields an empty list.
 *
 * Shared with the type-resolution side of the bridge, which has to reach the same two directories
 * through the mechanism TypeScript offers instead of `NODE_PATH`.
 */
export function hoistedResolutionDirs(root: string): string[] {
  return [path.join(root, 'node_modules', '.pnpm', 'node_modules'), path.join(root, 'node_modules')].filter((dir) =>
    fs.existsSync(dir)
  );
}

/**
 * Put the given root's {@link hoistedResolutionDirs} on the resolution path of this process and
 * its children. Idempotent; a no-op when neither directory exists. Callers decide *whether* the
 * root needs the bridge ({@link isGlobalVirtualStoreLayout} for the pre-aspect gate, the
 * dependency-resolver's own config after an install).
 */
export function ensureHoistedDependencyResolution(workspaceRoot: string): void {
  const dirs = hoistedResolutionDirs(workspaceRoot);
  if (!dirs.length) return;
  const existing = process.env.NODE_PATH;
  const untouched = (existing?.split(path.delimiter).filter(Boolean) ?? []).filter(
    // by path rather than by spelling, so an entry naming a directory this bridge owns is replaced
    // by the canonical one instead of being kept alongside it as a redundant search base
    (dir) => !dirs.some((owned) => isSamePath(dir, owned))
  );
  // rebuilt rather than prepended, because order is resolution order and an entry already present
  // is not necessarily in front of the one it has to beat: a bit that bridged the hoisted
  // directory alone leaves it in `NODE_PATH` for its children, and adding the root's node_modules
  // in front of it there would invert the walk the bridge exists to reproduce. Everything this
  // bridge does not own keeps its relative order, behind what the walk reached first.
  const next = [...dirs, ...untouched].join(path.delimiter);
  if (next !== existing) {
    process.env.NODE_PATH = next;
    // `NODE_PATH` is read once when the module system initializes, so a later assignment only
    // takes effect after re-deriving the global paths.
    (require('module') as { _initPaths(): void })._initPaths();
  }
  registerEsmNodePathLoader();
}

/**
 * The ESM half of {@link ensureHoistedDependencyResolution}.
 *
 * Node consults `NODE_PATH` only for CommonJS; ESM resolution ignores it entirely. Bit supports
 * ESM components, so without this an ESM package in the store cannot reach the hoisted directory
 * at all and the CommonJS half would only cover part of the problem.
 *
 * Registered two ways, because both matter:
 * - `module.register` for bit's own process, which is where aspects and envs are loaded.
 * - `NODE_OPTIONS`, so the processes bit spawns - env build steps, app servers, test workers -
 *   inherit it. They resolve their own dependencies and hit the same wall.
 *
 * The loader is inlined as a data URL rather than taken as a dependency so there is no file to
 * ship and no install step to depend on. `module.register` needs Node 20.6, so this is skipped
 * on older runtimes - the CommonJS half still applies there.
 */
function registerEsmNodePathLoader(): void {
  const nodeModule = require('module') as {
    register?: (specifier: string, parentURL: string) => void;
  };
  if (typeof nodeModule.register !== 'function') return;
  // mirror the CommonJS side exactly: every current NODE_PATH entry participates, in its order
  const dirs = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean);
  if (!dirs.length) return;
  const entries = dirs.join(path.delimiter);
  // ordered, not a set: the loader inlines the list, so a reordering leaves a registration whose
  // precedence no longer matches the one CommonJS now uses
  if (lastImportFlag && entries === lastRegisteredEntries) return;
  const loaderUrl = `data:text/javascript,${encodeURIComponent(esmNodePathLoaderSource(dirs))}`;
  const parentUrl = pathToFileURL(path.join(process.cwd(), '/')).href;
  try {
    nodeModule.register(loaderUrl, parentUrl);
  } catch {
    // A runtime that rejects the loader must not take the whole CLI down with it - the CommonJS
    // half of the workaround is unaffected, and only ESM packages relying on hoisting are lost.
    return;
  }
  lastRegisteredEntries = entries;
  const registration = `import{register}from'node:module';register(${JSON.stringify(loaderUrl)},${JSON.stringify(parentUrl)});`;
  const importFlag = `--import=data:text/javascript,${encodeURIComponent(registration)}`;
  // children get one flag carrying the full current set: replace our previous flag rather than
  // stacking loaders, and match our own flag exactly - a user's `--require ts-node/register`
  // in NODE_OPTIONS must not suppress the loader's propagation
  if (lastImportFlag && process.env.NODE_OPTIONS?.includes(lastImportFlag)) {
    process.env.NODE_OPTIONS = process.env.NODE_OPTIONS.replace(lastImportFlag, importFlag);
  } else if (!process.env.NODE_OPTIONS?.includes(importFlag)) {
    process.env.NODE_OPTIONS = process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ${importFlag}` : importFlag;
  }
  lastImportFlag = importFlag;
}
