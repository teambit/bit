import { readdir } from 'fs-extra';
import { existsSync } from 'fs';
import { join } from 'path';
import { getCoreAspectName, getCoreAspectPackageName } from '@teambit/aspect-loader';

export type CoreAspectInfo = {
  /** e.g. `teambit.workspace/workspace` */
  id: string;
  /** e.g. `workspace` */
  name: string;
  /** e.g. `@teambit/workspace` */
  packageName: string;
  /** the resolved package dir in the repo's node_modules (a dir of symlinks to the sources) */
  dir: string;
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
    const exists = existsSync(join(packagesRoot, 'node_modules', packageName, 'package.json'));
    // eslint-disable-next-line no-console
    if (!exists) console.warn(`[bundle] extra package "${packageName}" is not installed, skipping it`);
    return exists;
  });
}

export function toExportName(name: string): string {
  return name.replace(/[.\-/]+(.)/g, (_, chr) => chr.toUpperCase());
}

async function findRuntimeAndAspectFiles(dir: string) {
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    return {};
  }
  // prefer the TypeScript sources - in this repo the package dir is a dir of symlinks to the source
  // files, and esbuild is happiest compiling the sources directly.
  const pick = (suffix: string) =>
    files.find((f) => f.endsWith(`${suffix}.ts`)) || files.find((f) => f.endsWith(`${suffix}.js`));
  return {
    mainRuntimeFile: pick('.main.runtime'),
    aspectFile: pick('.aspect'),
  };
}

const stripExt = (file: string) => file.replace(/\.(ts|js)$/, '');

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
      const dir = join(packagesRoot, 'node_modules', packageName);
      if (!existsSync(join(dir, 'package.json'))) {
        // eslint-disable-next-line no-console
        console.warn(`[bundle] core aspect "${id}" is not installed under ${packagesRoot}, skipping`);
        return undefined;
      }
      const { mainRuntimeFile, aspectFile } = await findRuntimeAndAspectFiles(dir);
      return {
        id,
        name,
        packageName,
        dir,
        exportName: toExportName(name),
        mainRuntimeImport: mainRuntimeFile ? `${packageName}/${stripExt(mainRuntimeFile)}` : undefined,
        aspectImport: aspectFile ? `${packageName}/${stripExt(aspectFile)}` : undefined,
      };
    })
  );
  return infos.filter(Boolean) as CoreAspectInfo[];
}
