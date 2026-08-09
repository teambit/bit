import { readdir } from 'fs-extra';
import { existsSync } from 'fs';
import { join } from 'path';
import { getAspectDir, getCoreAspectName, getCoreAspectPackageName } from '@teambit/aspect-loader';
import { getAllCoreAspectsIds } from '../manifests';

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
export function getExtraPackages(repoRoot: string): string[] {
  return CANDIDATE_EXTRA_PACKAGES.filter((packageName) => {
    const exists = existsSync(join(repoRoot, 'node_modules', packageName, 'package.json'));
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

export async function getCoreAspectsInfo(): Promise<CoreAspectInfo[]> {
  const ids = getAllCoreAspectsIds();
  const infos = await Promise.all(
    ids.map(async (id): Promise<CoreAspectInfo | undefined> => {
      const name = getCoreAspectName(id);
      const packageName = getCoreAspectPackageName(id);
      let dir: string;
      try {
        dir = getAspectDir(id);
      } catch {
        // eslint-disable-next-line no-console
        console.warn(`[bundle] unable to resolve core aspect "${id}", skipping`);
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
