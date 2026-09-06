import { readdirSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { rspack } from '@rspack/core';
import { getCoreAspectPackageName } from '@teambit/aspect-loader';
import { fallbacksProvidePluginConfig } from '@teambit/webpack';
import {
  moduleFileExtensions,
  shouldUseSourceMap,
  imageInlineSizeLimit,
  resolveAlias,
  resolveFallback,
  cssParser,
  mjsRule,
  swcRule,
  sourceMapRule,
  fontRule,
  styleRules,
} from './rspack/rspack.common';
import { postCssConfig } from './rspack/postcss.config';

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
    .map((id) => getCoreAspectPackageName(id))
    .filter((packageName) => {
      const packageDir = resolvePackageDir(packageName);
      if (!packageDir) return false;
      const distDir = join(packageDir, 'dist');
      if (!fsDeps.existsSync(distDir)) return false;
      return fsDeps.readdirSync(distDir).some((f) => f.endsWith('.ui.runtime.js') || f.endsWith('.preview.runtime.js'));
    });
  return [...new Set([...UI_VENDOR_DLL_EXTRA_PACKAGES, ...corePackages])];
}

/**
 * locates a package's root directory via node_modules resolution, without going through the
 * package's `exports` map. Bit's own published packages declare a catch-all `"./*": "./*.ts"`
 * subpath export with no explicit `"./package.json"` entry, so
 * `require.resolve(`${packageName}/package.json`)` gets rewritten to a nonexistent
 * `package.json.ts` and throws for every one of them. Locating the directory first via
 * `require.resolve.paths` and only then checking for `package.json` on disk sidesteps that.
 */
export function resolvePackageDirFromNodeModules(packageName: string): string | undefined {
  try {
    const searchPaths = require.resolve.paths(packageName) || [];
    return searchPaths
      .map((nodeModulesDir) => join(nodeModulesDir, ...packageName.split('/')))
      .find((candidate) => existsSync(join(candidate, 'package.json')));
  } catch {
    return undefined;
  }
}

/**
 * per package: find its dist dir, filter for `.ui.runtime.js`/`.preview.runtime.js` files, and
 * `require()` each matched file directly rather than the bare package. Requiring the bare package
 * (its main entry) also pulls in whatever its *other* runtimes need - e.g. `@teambit/pnpm`'s main
 * runtime drags in `@pnpm/napi`, a native `.node` binary loader, unbundlable for any rspack target -
 * and is unrelated to what this feature needs. It's also the functionally correct behavior: a
 * downstream `DllReferencePlugin` consumer resolves each aspect via `aspectDef.runtimePath`, an
 * exact file path, never a bare package specifier - so the DLL's own compilation has to reach that
 * same exact file for `DllReferencePlugin` to later intercept it. Falls back to a bare
 * `require(pkg)` only for a package with no runtime-file concept at all (`react`/`react-dom`).
 *
 * Deliberately reuses `resolvePackageDirFromNodeModules` (not a fresh `require.resolve(pkg +
 * '/package.json')`) for the same reason that helper exists: `@teambit/*` packages' `exports` maps
 * block that path outright for every one of them, which would otherwise silently fall through to
 * the bare-package branch below and never actually fix anything for a real package.
 */
function buildDllEntryContents(packages: string[]): string {
  return packages
    .flatMap((pkg) => {
      const packageDir = resolvePackageDirFromNodeModules(pkg);
      const distDir = packageDir ? join(packageDir, 'dist') : undefined;
      const runtimeFiles =
        distDir && existsSync(distDir)
          ? readdirSync(distDir).filter((f) => f.endsWith('.ui.runtime.js') || f.endsWith('.preview.runtime.js'))
          : [];
      if (!distDir || runtimeFiles.length === 0) {
        return [`exports[${JSON.stringify(pkg)}] = require(${JSON.stringify(pkg)});`];
      }
      return runtimeFiles.map(
        (f) => `exports[${JSON.stringify(`${pkg}/dist/${f}`)}] = require(${JSON.stringify(join(distDir, f))});`
      );
    })
    .join('\n');
}

export async function buildUiVendorDll(outputPath: string, packages: string[]): Promise<void> {
  const dllOutputDir = join(outputPath, UI_VENDOR_DLL_DIR);
  const entryFile = join(dllOutputDir, 'vendor-entry.js');
  const entryContents = buildDllEntryContents(packages);
  mkdirSync(dllOutputDir, { recursive: true });
  writeFileSync(entryFile, entryContents);

  const compiler = rspack({
    mode: 'production',
    entry: entryFile,
    // required for `module.parser: cssParser` below to mean anything - rspack's native 'css'/
    // 'css/module' module types (and their parser options) only exist with this enabled, same as
    // `rspack.browser.config.ts`.
    experiments: {
      css: true,
    },
    output: {
      path: dllOutputDir,
      filename: UI_VENDOR_DLL_CHUNK_FILENAME,
      library: { name: UI_VENDOR_DLL_GLOBAL_NAME, type: 'window' },
    },
    // the same resolve/module machinery the existing pre-bundle (`rspack.browser.config.ts`) uses -
    // real core aspects' `.ui.runtime.js`/`.preview.runtime.js` files pull in bit's actual UI
    // component library (design-system components, graph rendering, syntax highlighting, GraphQL,
    // etc.), which needs the same CSS/SCSS loader, JSX/TSX transform, and resolve fallback/alias
    // table this config already has - a from-scratch minimal config only ever worked for tiny
    // CommonJS-only fixtures (`lodash.compact`), not real UI code (confirmed: 600 rspack errors
    // against the real production package list before this fix).
    resolve: {
      extensions: moduleFileExtensions.map((ext) => `.${ext}`),
      alias: resolveAlias({ profile: false }),
      fallback: resolveFallback,
      // unlike the pre-bundle's entry (generated inside `node_modules/@teambit/ui/`, so the default
      // walk-up finds it), the DLL's own entry file lives under the build's output directory (a
      // capsule's artifacts dir, or a test tmpdir) - outside any node_modules tree. A bare require
      // there (`react`, `react-dom`, or a test fixture) has no ancestor `node_modules` to walk up to
      // at all, so the explicit repo-root path covers it. `'node_modules'` is kept alongside it (not
      // replaced) so files that *are* inside the tree - e.g. `@teambit/harmony`'s own pnpm-nested
      // `cleargraph` dependency - still get the default walk-up: a single hardcoded root without it
      // is exactly what broke that resolution earlier.
      modules: [join(process.cwd(), 'node_modules'), 'node_modules'],
    },
    module: {
      parser: cssParser,
      rules: [
        mjsRule(),
        swcRule(),
        sourceMapRule(),
        {
          test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/, /\.svg$/],
          type: 'asset',
          parser: { dataUrlCondition: { maxSize: imageInlineSizeLimit } },
        },
        fontRule(),
        ...styleRules({ sourceMap: shouldUseSourceMap, postCssConfig, resolveUrlLoader: true }),
        {
          exclude: [/\.(cjs|js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/, /\.css$/, /\.s[ac]ss$/, /\.less$/],
          type: 'asset/resource',
        },
      ],
    },
    plugins: [
      new rspack.ProvidePlugin({ process: fallbacksProvidePluginConfig.process }),
      new rspack.IgnorePlugin({ resourceRegExp: /^\.\/locale$/, contextRegExp: /moment$/ }),
      new rspack.DllPlugin({
        path: join(dllOutputDir, UI_VENDOR_DLL_MANIFEST_FILENAME),
        name: UI_VENDOR_DLL_GLOBAL_NAME,
        type: 'window',
        entryOnly: false,
      }),
    ],
    // some covered packages' own `.ui.runtime.js` legitimately imports from `@teambit/ui`'s barrel
    // (e.g. `@teambit/pnpm`'s `pnpm.ui.runtime.js`, `@teambit/yarn`'s `yarn.ui.runtime.js`) - which,
    // same as `rspack.browser.config.ts`'s externals (see that file's comment), has a real
    // require()-reachable edge back into this very module (and everything it imports to build this
    // config) via `bundle-ui.task.ts`. Dead in any actually-executed context (nothing but the
    // Node-only `BundleUiTask.execute()` calls into this file, and the loader/plugin packages below
    // are only ever consumed to build this config object, never executed as part of its output), so
    // safe to externalize here too - kept in sync with `rspack.browser.config.ts`'s list.
    externals: {
      '@rspack/core': 'commonjs @rspack/core',
      '@teambit/aspect-loader': 'commonjs @teambit/aspect-loader',
      '@teambit/webpack': 'commonjs @teambit/webpack',
      'postcss-loader': 'commonjs postcss-loader',
      'postcss-preset-env': 'commonjs postcss-preset-env',
      'resolve-url-loader': 'commonjs resolve-url-loader',
      'sass-loader': 'commonjs sass-loader',
      'rspack-manifest-plugin': 'commonjs rspack-manifest-plugin',
      'postcss-normalize': 'commonjs postcss-normalize',
    },
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
