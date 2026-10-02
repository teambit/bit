import { readdir } from 'fs-extra';
import { join } from 'path';
import { getCoreAspectName, getCoreAspectPackageName } from '@teambit/aspect-loader';
import { resolvePackageDir } from './resolve-package-dir';

export type CoreAspectInfo = {
  /** e.g. `teambit.workspace/workspace` */
  id: string;
  /** e.g. `workspace` */
  name: string;
  /** e.g. `@teambit/workspace` */
  packageName: string;
  /** the resolved package dir - see `resolvePackageDir` for the layouts this can be */
  dir: string;
  /**
   * where inside the package the runtime/aspect files were found: `''` for this repo's
   * symlink-farm-of-sources layout, `'dist'` for a published package or a capsule. Import specifiers
   * are built from it, so it is the difference between importing the compiled JS and the raw TS.
   */
  filesSubDir: string;
  /** the export name used in the bundle's barrel, e.g. `dependencyResolver` */
  exportName: string;
  /**
   * deep import specifier of the aspect's main runtime, e.g. `@teambit/envs/environments.main.runtime`.
   * undefined when the aspect has no main runtime (UI-only aspects).
   * the basename cannot be derived from the id - `teambit.envs/envs` lives in `environments.main.runtime.ts`.
   */
  mainRuntimeImport?: string;
  /** deep import specifier of the `*.aspect` file, e.g. `@teambit/envs/environments.aspect` */
  aspectImport?: string;
  /**
   * basenames (no extension) of the aspect's *other* runtimes - `preview`, `ui`, ... - e.g.
   * `preview.preview.runtime`.
   *
   * They are never imported into the bundle: only the main runtime runs in the CLI process. They are
   * listed so the shims can emit a file per runtime, because `getAspectDef(id, runtime)` discovers a
   * runtime by globbing `<pkg>/dist` for `*.<runtime>.runtime.js` and an aspect with no such file is
   * dropped from `uiRoot.resolveAspects(runtime)`. Without them a bundled bit resolves **zero**
   * preview aspects, and the pre-bundle `.hash` - a sha1 over that list - comes out as the sha1 of
   * the empty string, so no shipped pre-bundle can ever match. See `bundle-plan.md` §17f.
   */
  otherRuntimeFileBases: string[];
};

/**
 * additional `@teambit/*` packages that are not aspects but that user code (and bit's own generated
 * code) imports directly, so they must be re-exported from the bundle too.
 *
 * `@teambit/legacy` is deliberately NOT here. `bit-bundle2` included it, but that predates the split
 * of legacy into per-concern packages (`@teambit/legacy.constants`, `@teambit/legacy.logger`, ...)
 * which are ordinary workspace components and get bundled like any other. Nothing in the sources
 * imports the old umbrella package any more; a copy lingering in a developer's node_modules is a
 * leftover, and relying on it produced a bundle that built locally and failed on CI.
 */
const CANDIDATE_EXTRA_PACKAGES = ['@teambit/harmony'];

/**
 * Only the extras actually present. A missing one must not fail the build - it means the package is
 * no longer part of the installation, which is information, not an error.
 */
export function getExtraPackages(packagesRoot: string): string[] {
  return CANDIDATE_EXTRA_PACKAGES.filter((packageName) => {
    const exists = Boolean(resolvePackageDir(packagesRoot, packageName));
    // eslint-disable-next-line no-console
    if (!exists) console.warn(`[bundle] extra package "${packageName}" is not installed, skipping it`);
    return exists;
  });
}

export function toExportName(name: string): string {
  return name.replace(/[.\-/]+(.)/g, (_, chr) => chr.toUpperCase());
}

const RUNTIME_SUFFIX = '.main.runtime';
const ASPECT_SUFFIX = '.aspect';

/**
 * Locate the `*.aspect.*` and `*.main.runtime.*` files, which cannot be derived from the aspect id -
 * `teambit.envs/envs` lives in `environments.main.runtime.ts`, `teambit.harmony/panels` in
 * `panel-ui.main.runtime.ts`.
 *
 * Two layouts have to work. In this repo the package dir is a dir of symlinks to the **sources**, so
 * the files sit at the top level as `.ts`. In a published package or a capsule they are compiled and
 * live under `dist/` as `.js`. Looking only at the top level - which is what this did - silently
 * reports "no main runtime" for the compiled layout, and since a missing main runtime is legitimate
 * for a UI-only aspect, nothing complains: a real build reported 70 of 71 aspects "without a main
 * runtime" and produced a bundle with almost no runtimes in it.
 */
/** any `<something>.<runtime>.runtime.<ext>`, e.g. `preview.preview.runtime.tsx` */
const ANY_RUNTIME = /\.[a-z0-9-]+\.runtime\.(ts|tsx|js|jsx)$/;

async function findRuntimeAndAspectFiles(dir: string): Promise<{
  mainRuntimeFile?: string;
  aspectFile?: string;
  otherRuntimeFiles: string[];
  filesSubDir: string;
}> {
  const readDirSafe = async (target: string) => {
    try {
      return await readdir(target);
    } catch {
      return [] as string[];
    }
  };
  // `dist` first, and that is not a preference - it is what keeps one module one module. A bare
  // `@teambit/x` resolves through `main`/`exports` to `dist/index.js`; were the deep import to go to
  // the top-level `.ts` instead, the same aspect would land in the bundle twice, once compiled and
  // once from source - two `XAspect` objects and two runtime registries (§6.2). Verified against a
  // real capsule: `@teambit/envs/environments.main.runtime` resolves to the raw `.ts`, whereas
  // `@teambit/envs/dist/environments.main.runtime.js` resolves to the compiled file.
  for (const subDir of ['dist', '']) {
    // eslint-disable-next-line no-await-in-loop
    const files = await readDirSafe(subDir ? join(dir, subDir) : dir);
    const pick = (suffix: string) =>
      subDir
        ? files.find((f) => f.endsWith(`${suffix}.js`))
        : files.find((f) => f.endsWith(`${suffix}.ts`) && !f.endsWith('.d.ts')) ||
          files.find((f) => f.endsWith(`${suffix}.js`));
    const aspectFile = pick(ASPECT_SUFFIX);
    const mainRuntimeFile = pick(RUNTIME_SUFFIX);
    if (aspectFile || mainRuntimeFile) {
      const otherRuntimeFiles = files.filter(
        (f) => ANY_RUNTIME.test(f) && !f.endsWith('.d.ts') && !f.includes(RUNTIME_SUFFIX)
      );
      return { mainRuntimeFile, aspectFile, otherRuntimeFiles, filesSubDir: subDir };
    }
  }
  return { otherRuntimeFiles: [], filesSubDir: '' };
}

const stripExt = (file: string) => file.replace(/\.(tsx|jsx|ts|js)$/, '');

/**
 * The core aspect ids are an *input*, not something this component discovers.
 *
 * They live in `@teambit/bit`'s `manifests.ts`, and importing them here would make the bundler
 * depend on the very component it bundles - which becomes a genuine cycle once `bit`'s env depends
 * on this component. Instead each caller supplies them from where it already has them: the repo
 * script imports `manifests` directly (it runs inside `@teambit/bit`), and the build task reads the
 * compiled `manifests.js` out of the capsule it is building.
 *
 * `packagesRoot` is likewise explicit rather than resolved from the running process: during a build
 * the packages to read are the capsule's, not the ones bit itself is running from.
 */
export async function getCoreAspectsInfo(coreAspectIds: string[], packagesRoot: string): Promise<CoreAspectInfo[]> {
  const ids = coreAspectIds;
  const infos = await Promise.all(
    ids.map(async (id): Promise<CoreAspectInfo | undefined> => {
      const name = getCoreAspectName(id);
      const packageName = getCoreAspectPackageName(id);
      const dir = resolvePackageDir(packagesRoot, packageName);
      if (!dir) {
        // eslint-disable-next-line no-console
        console.warn(`[bundle] core aspect "${id}" is not resolvable from ${packagesRoot}, skipping`);
        return undefined;
      }
      const { mainRuntimeFile, aspectFile, otherRuntimeFiles, filesSubDir } = await findRuntimeAndAspectFiles(dir);
      // The extension has to survive under `dist` and has to go at the top level, because the two
      // take different branches of the exports map and **neither branch extension-probes**:
      //   "./dist/*": "./dist/*"   =>  `<pkg>/dist/x.main.runtime.js` -> ./dist/x.main.runtime.js
      //   "./*":      "./*.ts"     =>  `<pkg>/x.main.runtime`         -> ./x.main.runtime.ts
      // Dropping `.js` from the first yields a specifier that simply does not resolve (verified), and
      // keeping `.ts` on the second yields `./x.main.runtime.ts.ts`.
      const specifier = (file: string) =>
        filesSubDir ? `${packageName}/${filesSubDir}/${file}` : `${packageName}/${stripExt(file)}`;
      return {
        id,
        name,
        packageName,
        dir,
        filesSubDir,
        exportName: toExportName(name),
        mainRuntimeImport: mainRuntimeFile ? specifier(mainRuntimeFile) : undefined,
        aspectImport: aspectFile ? specifier(aspectFile) : undefined,
        otherRuntimeFileBases: otherRuntimeFiles.map(stripExt),
      };
    })
  );
  return infos.filter(Boolean) as CoreAspectInfo[];
}
