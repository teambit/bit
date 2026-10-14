import fs from 'fs';
import path from 'path';
import { getAspectDir, getCoreAspectName, getCoreAspectPackageName } from '@teambit/aspect-loader/dist/core-aspects.js';
import coreAspectIds from './core-aspect-ids.json';

const BIT_ASPECT_ID = 'teambit.harmony/bit';

type LinkSource = { id: string; packageName: string; dir: string };

/**
 * Where the running bit's core aspects and core packages live, for the `link:` dependencies native
 * `bit install` adds to the root manifest. Mirrors the non-bvm branches of `DependencyLinker`'s
 * `linkCoreAspect` and `linkNonAspectCorePackages`; Rust prefers the bvm directory itself.
 */
export function coreAspectsInfo() {
  const bitDir = getAspectDir(BIT_ASPECT_ID);
  const coreAspects: LinkSource[] = [];
  for (const id of coreAspectIds as string[]) {
    if (id === BIT_ASPECT_ID) continue;
    const dir = aspectSource(id, bitDir);
    if (dir) coreAspects.push({ id, packageName: getCoreAspectPackageName(id), dir });
  }
  const corePackages = ['legacy', 'harmony'].map((name) => ({
    id: '',
    packageName: `@teambit/${name}`,
    dir: corePackageSource(name, bitDir),
  }));
  return { bitDir, coreAspects, corePackages };
}

function aspectSource(id: string, bitDir: string): string | undefined {
  const distDir = path.join(bitDir, 'dist', getCoreAspectName(id));
  try {
    if (!fs.existsSync(distDir)) return getAspectDir(id);
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return path.resolve(path.join(require(distDir).path, '..', '..'));
  } catch {
    return undefined;
  }
}

function corePackageSource(name: string, bitDir: string): string {
  const packageName = `@teambit/${name}`;
  const distDir = path.join(bitDir, 'dist', name);
  if (fs.existsSync(distDir)) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return path.resolve(path.join(require(distDir).path, '..', '..'));
  }
  const resolved = require.resolve(packageName);
  if (resolved.includes(packageName)) return path.join(resolved, '../..');
  const nmDir = __dirname.substring(0, __dirname.indexOf('@teambit'));
  return path.join(nmDir, packageName);
}
