import { readdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { rspack } from '@rspack/core';
import { ensureDirSync } from 'fs-extra';

export const UI_VENDOR_DLL_DIR = 'ui-vendor-dll';
export const UI_VENDOR_DLL_MANIFEST_FILENAME = 'vendor-manifest.json';
export const UI_VENDOR_DLL_CHUNK_FILENAME = 'vendor.js';
export const UI_VENDOR_DLL_GLOBAL_NAME = '__bitUiVendor__';
export const UI_VENDOR_DLL_EXTRA_PACKAGES = ['react', 'react-dom'];

type FsDeps = { readdirSync: (dir: string) => string[]; existsSync: (p: string) => boolean };
const realFsDeps: FsDeps = { readdirSync, existsSync };

/**
 * every core aspect package that ships browser (ui or preview) runtime code, plus react/react-dom.
 * these are exactly the packages a bundled bit's shims redirect into `bit.app.js` for - the ones a
 * third-party UI root's rspack build cannot compile from source. computed dynamically (not
 * hand-listed) from bit's own installation at the time `BundleUiTask` runs, so it never drifts from
 * what the existing pre-bundle actually covers.
 */
export function resolveUiVendorDllPackages(
  coreAspectIds: string[],
  resolvePackageDir: (packageName: string) => string | undefined,
  fsDeps: FsDeps = realFsDeps
): string[] {
  const corePackages = coreAspectIds
    .map((id) => {
      const [scope, ...nameParts] = id.split('/');
      return `@${scope.replace('.', '/')}.${nameParts.join('.')}`;
    })
    .filter((packageName) => {
      const packageDir = resolvePackageDir(packageName);
      if (!packageDir) return false;
      const distDir = join(packageDir, 'dist');
      if (!fsDeps.existsSync(distDir)) return false;
      return fsDeps.readdirSync(distDir).some((f) => f.endsWith('.ui.runtime.js') || f.endsWith('.preview.runtime.js'));
    });
  return [...new Set([...UI_VENDOR_DLL_EXTRA_PACKAGES, ...corePackages])];
}

export async function buildUiVendorDll(outputPath: string, packages: string[]): Promise<void> {
  const dllOutputDir = join(outputPath, UI_VENDOR_DLL_DIR);
  const entryFile = join(dllOutputDir, 'vendor-entry.js');
  const entryContents = packages
    .map((pkg) => `exports[${JSON.stringify(pkg)}] = require(${JSON.stringify(pkg)});`)
    .join('\n');
  ensureDirSync(dllOutputDir);
  writeFileSync(entryFile, entryContents);

  const compiler = rspack({
    mode: 'production',
    context: process.cwd(),
    entry: entryFile,
    output: {
      path: dllOutputDir,
      filename: UI_VENDOR_DLL_CHUNK_FILENAME,
      library: { name: UI_VENDOR_DLL_GLOBAL_NAME, type: 'window' },
    },
    resolve: {
      modules: [join(process.cwd(), 'node_modules')],
    },
    plugins: [
      new rspack.DllPlugin({
        path: join(dllOutputDir, UI_VENDOR_DLL_MANIFEST_FILENAME),
        name: UI_VENDOR_DLL_GLOBAL_NAME,
        type: 'window',
        entryOnly: false,
      }),
    ],
  });

  await new Promise<void>((resolvePromise, reject) => {
    compiler.run((err, stats) => {
      compiler.close((closeErr) => {
        if (err) return reject(err);
        if (stats?.hasErrors()) return reject(new Error(stats.toString()));
        if (closeErr) return reject(closeErr);
        resolvePromise();
      });
    });
  });
}
