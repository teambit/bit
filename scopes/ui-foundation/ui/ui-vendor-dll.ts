import { readdirSync, existsSync } from 'fs';
import { join } from 'path';

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
