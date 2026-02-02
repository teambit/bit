/**
 * PERFORMANCE OPTIMIZATION: Shared Dependencies Bundler for Dev Server
 *
 * Uses Bit's dependency resolver APIs to collect and pre-bundle common dependencies
 * with esbuild, allowing webpack to externalize them for faster compilation.
 *
 * Target: 3-5x performance improvement
 */

import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { builtinModules } from 'module';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import type { Component } from '@teambit/component';
import type { ExecutionContext } from '@teambit/envs';

export interface SharedDepsBundleResult {
  bundlePath: string;
  publicPath: string;
  externalsMap: Record<string, string>;
  timeTaken: number;
  depsCount: number;
}

export interface SharedDepsBundleOptions {
  rootDir: string;
  packages: string[];
  outputDir: string;
  useCache?: boolean;
}

/**
 * Convert package name to a valid global variable name
 * Uses the same convention as generateExternalsTransformer (get-externals.ts)
 * This ensures consistency between dev server externals and shared deps bundle
 */
function toGlobalName(packageName: string): string {
  // Match the externals pattern from get-externals.ts:
  // camelcase(depName.replace('@', '').replace('/', '-'), { pascalCase: true })
  const camelcase = require('camelcase');
  return camelcase(packageName.replace('@', '').replace('/', '-'), { pascalCase: true });
}

function generateCacheKey(packages: string[]): string {
  const hash = createHash('md5');
  hash.update(packages.sort().join('|'));
  return hash.digest('hex').slice(0, 12);
}

function packageExists(pkgName: string, rootDir: string): boolean {
  try {
    require.resolve(pkgName, { paths: [rootDir] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a package is intended for browser use by examining its package.json
 * This is data-driven - we use the package's own metadata to determine browser compatibility
 */
function isBrowserSafePackage(pkgName: string, rootDir: string): boolean {
  try {
    // Resolve the package's main file
    const pkgPath = require.resolve(pkgName, { paths: [rootDir] });
    // Find the package.json by traversing up
    let dir = require('path').dirname(pkgPath);
    let pkgJson: any;
    for (let i = 0; i < 10; i++) {
      try {
        pkgJson = JSON.parse(readFileSync(require('path').join(dir, 'package.json'), 'utf-8'));
        if (pkgJson.name === pkgName || pkgJson.name === pkgName.split('/')[0]) {
          break;
        }
      } catch {
        // No package.json here, go up
      }
      const parent = require('path').dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    if (!pkgJson) return true; // If we can't find package.json, assume it's fine

    // Check for indicators that this is NOT browser-safe:
    // 1. Has "bin" field (CLI tool)
    // 2. Has engines.node but no browser/module/exports.browser field
    // 3. Main field points to something with "cli" or "bin" in the path
    // 4. Has native dependencies (gyp, postinstall scripts that compile)
    // 5. Has optionalDependencies that are native modules
    // 6. Dependencies on Node.js built-in modules

    const hasBin = !!pkgJson.bin;
    const hasBrowser = !!pkgJson.browser;
    const hasModule = !!pkgJson.module;
    const hasBrowserExport = pkgJson.exports?.browser || pkgJson.exports?.['.'?.browser];
    const mainPath = pkgJson.main || '';
    const isCli = mainPath.includes('cli') || mainPath.includes('bin');

    // Check for native module indicators
    const hasGyp = !!pkgJson.gypfile;
    const hasNativeInstall =
      pkgJson.scripts?.install?.includes('node-gyp') ||
      pkgJson.scripts?.postinstall?.includes('node-gyp') ||
      pkgJson.scripts?.install?.includes('prebuild') ||
      pkgJson.scripts?.postinstall?.includes('prebuild');
    const hasNativeDeps = Object.keys(pkgJson.optionalDependencies || {}).some(
      (dep) => dep.includes('-darwin-') || dep.includes('-linux-') || dep.includes('-win32-')
    );

    // Check if package has dependencies on Node.js built-in modules
    const allDeps = { ...pkgJson.dependencies, ...pkgJson.peerDependencies };
    const nodeBuiltins = getNodeBuiltins();
    const hasNodeBuiltinDeps = Object.keys(allDeps).some((dep) => nodeBuiltins.has(dep));

    // Check if package uses @types/node - indicates Node.js-specific code
    // This is data-driven: packages that need Node.js types use Node.js APIs
    const devDeps = pkgJson.devDependencies || {};
    const hasNodeTypes = '@types/node' in devDeps;

    // PROGRAMMATIC testing library detection:
    // Testing libraries typically have peer deps on testing frameworks (jest, vitest, etc.)
    // This is data-driven - we check what the package DECLARES it needs, not hardcoded names
    const peerDeps = pkgJson.peerDependencies || {};
    const testingFrameworks = ['jest', '@jest/globals', 'vitest', 'mocha', 'chai', 'jasmine', 'ava'];
    const hasTestingFrameworkPeerDep = Object.keys(peerDeps).some((dep) =>
      testingFrameworks.some((tf) => dep === tf || dep.startsWith(`${tf}/`) || dep.startsWith(`@${tf}/`))
    );

    // Get base package name for pattern matching
    const basePkgName = pkgName.startsWith('@') ? pkgName.split('/').slice(0, 2).join('/') : pkgName.split('/')[0];

    // Check for name patterns that indicate server-only packages
    // These patterns are based on npm naming conventions, not hardcoded package names
    const nameIndicatesServerOnly =
      basePkgName.includes('-agent') ||
      basePkgName.includes('proxy-') ||
      basePkgName.endsWith('-server') ||
      basePkgName.endsWith('-cli');

    // If it's clearly a CLI tool, skip it
    if (hasBin && !hasBrowser && !hasModule && !hasBrowserExport) {
      return false;
    }

    // If main points to CLI/bin, skip it
    if (isCli && !hasBrowser) {
      return false;
    }

    // If it has native module indicators, skip it
    if (hasGyp || hasNativeInstall || hasNativeDeps) {
      return false;
    }

    // If it depends on Node.js built-ins and has no browser field, skip it
    if (hasNodeBuiltinDeps && !hasBrowser && !hasBrowserExport) {
      return false;
    }

    // If it uses @types/node and name suggests server-only, skip it
    // This catches packages like https-proxy-agent, agent-base, etc.
    if (hasNodeTypes && nameIndicatesServerOnly && !hasBrowser) {
      console.log('[shared-deps] Skipping Node.js-specific package:', basePkgName);
      return false;
    }

    // PROGRAMMATIC: If package has testing framework peer deps, it's a testing utility
    // These require Jest/Vitest globals which won't be available in browser preview
    if (hasTestingFrameworkPeerDep) {
      console.log('[shared-deps] Skipping testing library (has testing framework peer dep):', basePkgName);
      return false;
    }

    return true;
  } catch {
    return true; // If check fails, include it and let esbuild handle errors
  }
}

/**
 * Get Node.js built-in modules using the official Node.js API
 */
function getNodeBuiltins(): Set<string> {
  const builtins = new Set<string>();
  for (const mod of builtinModules) {
    builtins.add(mod);
    builtins.add(`node:${mod}`);
  }
  return builtins;
}

/**
 * Create a shared externalized bundle of dependencies using esbuild
 */
export async function createSharedDepsBundle(options: SharedDepsBundleOptions): Promise<SharedDepsBundleResult> {
  const startTime = Date.now();
  const { rootDir, packages, outputDir, useCache = true } = options;

  // Filter to existing packages only, and check browser safety
  const existingPackages = packages.filter((pkg) => {
    const mainPkg = pkg.includes('/') && !pkg.startsWith('@') ? pkg.split('/')[0] : pkg;
    if (!packageExists(mainPkg, rootDir)) return false;
    // Data-driven check: use the package's own metadata to determine browser compatibility
    if (!isBrowserSafePackage(mainPkg, rootDir)) {
      console.log('[shared-deps] Skipping non-browser package:', mainPkg);
      return false;
    }
    return true;
  });

  if (existingPackages.length === 0) {
    return {
      bundlePath: '',
      publicPath: '',
      externalsMap: {},
      timeTaken: Date.now() - startTime,
      depsCount: 0,
    };
  }

  const cacheKey = generateCacheKey(existingPackages);
  const bundleFilename = `shared-deps-${cacheKey}.js`;
  const bundlePath = join(outputDir, bundleFilename);
  const metaPath = join(outputDir, `shared-deps-${cacheKey}.meta.json`);
  // Serve shared deps under static/js/ path like other webpack assets
  // This path works through the UI server proxy since it follows the same pattern
  const publicPath = 'static/js/__bit_shared_deps__';

  // Check cache
  if (useCache && existsSync(bundlePath) && existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      console.log('[shared-deps] Using cached bundle with', Object.keys(meta.externalsMap).length, 'packages');
      return {
        bundlePath,
        publicPath,
        externalsMap: meta.externalsMap,
        timeTaken: Date.now() - startTime,
        depsCount: meta.depsCount,
      };
    } catch {
      // Cache invalid, rebuild
    }
  }

  mkdirSync(outputDir, { recursive: true });

  // Build externals map for provided packages
  const externalsMap: Record<string, string> = {};
  existingPackages.forEach((pkg) => {
    externalsMap[pkg] = toGlobalName(pkg);
  });

  // For React, also include jsx-runtime subpaths which have different exports
  // These are critical for JSX compilation to work
  if (existingPackages.includes('react')) {
    externalsMap['react/jsx-runtime'] = 'ReactJsxRuntime';
    externalsMap['react/jsx-dev-runtime'] = 'ReactJsxDevRuntime';
  }

  // Generate entry file using the SAME pattern as production (create-peers-link.ts)
  // This exposes packages directly on window for webpack externals to find
  const entryLines: string[] = ['// @ts-nocheck'];

  // Import all packages
  existingPackages.forEach((dep) => {
    const globalName = externalsMap[dep];
    entryLines.push(`import * as ${globalName} from "${dep}";`);
  });

  // Add jsx-runtime imports if react is included
  if (existingPackages.includes('react')) {
    entryLines.push(`import * as ReactJsxRuntime from "react/jsx-runtime";`);
    entryLines.push(`import * as ReactJsxDevRuntime from "react/jsx-dev-runtime";`);
  }

  // Expose all packages on window (matching production pattern)
  entryLines.push('');
  entryLines.push('const globalObj = typeof window !== "undefined" ? window : globalThis;');
  entryLines.push('');

  // Guard function to prevent overwriting existing globals (from create-peers-link.ts)
  entryLines.push(`function guard(property, expected) {
  var existing = globalObj[property];
  if (existing === expected && expected !== undefined)
    console.warn('[bit-shared-deps] "' + property + '" already exists in global scope, but with correct value');
  else if (existing !== undefined)
    console.warn('[bit-shared-deps] "' + property + '" already exists in the global scope, skipping');
}`);
  entryLines.push('');

  // Set each package on window
  existingPackages.forEach((dep) => {
    const globalName = externalsMap[dep];
    entryLines.push(`guard("${globalName}", ${globalName});`);
    entryLines.push(`globalObj["${globalName}"] = ${globalName};`);
  });

  // Add jsx-runtime globals if react is included
  if (existingPackages.includes('react')) {
    entryLines.push(`guard("ReactJsxRuntime", ReactJsxRuntime);`);
    entryLines.push(`globalObj["ReactJsxRuntime"] = ReactJsxRuntime;`);
    entryLines.push(`guard("ReactJsxDevRuntime", ReactJsxDevRuntime);`);
    entryLines.push(`globalObj["ReactJsxDevRuntime"] = ReactJsxDevRuntime;`);
  }

  const entryContent = entryLines.join('\n');

  const entryPath = join(outputDir, 'shared-deps-entry.js');
  writeFileSync(entryPath, entryContent);

  try {
    const esbuild = require('esbuild');

    // CSS plugin to stub CSS imports
    const cssPlugin = {
      name: 'css-plugin',
      setup(build: any) {
        build.onResolve({ filter: /\.(css|scss|sass|less)$/ }, (args: any) => ({
          path: args.path,
          namespace: 'css-stub',
        }));
        build.onLoad({ filter: /.*/, namespace: 'css-stub' }, () => ({
          contents: 'export default {}',
          loader: 'js',
        }));
      },
    };

    // Plugin to handle native modules and other unbundleable files
    // Data-driven: esbuild tells us what can't be bundled
    const nativeModulesPlugin = {
      name: 'native-modules',
      setup(build: any) {
        // Handle .node files (native modules) by marking as external
        build.onResolve({ filter: /\.node$/ }, (args: any) => ({
          path: args.path,
          external: true,
        }));

        // Handle packages with native bindings (identified by file extension patterns)
        build.onLoad({ filter: /binding\.js$/ }, async (args: any) => {
          // Check if the file tries to load native modules
          const fs = require('fs');
          const content = fs.readFileSync(args.path, 'utf-8');
          if (content.includes('.node') || content.includes('nativeBinding')) {
            // Return an empty stub for binding files that load native modules
            return {
              contents: 'module.exports = {};',
              loader: 'js',
            };
          }
          return null; // Let esbuild handle normally
        });

        // Handle relative paths that can't be resolved (like ../pkg in lightningcss)
        build.onResolve({ filter: /^\.\.\// }, (args: any) => {
          // Check if this is inside a native module package
          if (
            args.resolveDir.includes('lightningcss') ||
            args.resolveDir.includes('@swc') ||
            args.resolveDir.includes('@parcel')
          ) {
            return { path: args.path, external: true };
          }
          return null;
        });
      },
    };

    // Use Node.js API to get builtins - no hardcoding
    const nodeBuiltins = getNodeBuiltins();
    const nodeExternals = Array.from(nodeBuiltins);

    // Data-driven plugin: Mark packages that fail to resolve as external
    // This handles packages with native dependencies, server-only code, etc.
    const excludedPackages = new Set<string>();
    const externalizeFailuresPlugin = {
      name: 'externalize-failures',
      setup(build: any) {
        // Handle unresolved packages by marking them as external
        build.onResolve({ filter: /.*/ }, async (args: any) => {
          // Skip entry points and relative imports
          if (args.kind === 'entry-point' || args.path.startsWith('.') || args.path.startsWith('/')) {
            return null;
          }

          // Get the base package name
          const basePkg = args.path.startsWith('@')
            ? args.path.split('/').slice(0, 2).join('/')
            : args.path.split('/')[0];

          // If we've already excluded this package, mark as external
          if (excludedPackages.has(basePkg)) {
            return { path: args.path, external: true };
          }

          // Try to resolve - if it fails, mark as external
          try {
            // Use Node.js require.resolve to check if the package exists
            require.resolve(args.path, { paths: [rootDir, args.resolveDir] });
            return null; // Let esbuild handle it normally
          } catch {
            // Package doesn't exist or can't be resolved - mark as external
            excludedPackages.add(basePkg);
            return { path: args.path, external: true };
          }
        });
      },
    };

    console.log('[shared-deps] Building bundle with', existingPackages.length, 'packages...');
    const buildStart = Date.now();

    /**
     * Build bundle using the same pattern as production (create-peers-link.ts)
     * The entry file imports packages and exposes them on window
     */
    const buildResult = await esbuild.build({
      entryPoints: [entryPath],
      bundle: true,
      outfile: bundlePath,
      format: 'iife', // IIFE to execute immediately and set window globals
      // No globalName - we expose packages on window directly in the entry code
      platform: 'browser',
      target: 'es2020',
      // PERFORMANCE: Minify aggressively to keep bundle small
      minify: true,
      // NO source maps - shared deps don't need debugging, keep bundle tiny
      sourcemap: false,
      // DISABLE tree-shaking - we need to keep the window exposure side effects
      // The globalObj["React"] = React assignments must NOT be removed
      treeShaking: false,
      // Keep error visibility for debugging
      logLevel: 'error',
      metafile: true,
      define: {
        'process.env.NODE_ENV': '"production"', // Production mode for smaller bundle
        global: 'window',
      },
      plugins: [nativeModulesPlugin, externalizeFailuresPlugin, cssPlugin],
      external: nodeExternals,
    });

    console.log('[shared-deps] esbuild completed in', Date.now() - buildStart, 'ms');
    console.log('[shared-deps] Packages marked as external due to resolution failures:', excludedPackages.size);

    // Log transitive deps for debugging (but DON'T add to externalsMap)
    // Transitive deps are bundled INSIDE the shared deps bundle, not exposed on window.
    // Adding them to externalsMap would cause runtime errors (window.VarName undefined).
    // Only explicitly requested packages are exposed on window.
    if (buildResult.metafile) {
      const bundledInputs = Object.keys(buildResult.metafile.inputs);
      const transitiveDeps = new Set<string>();

      for (const inputPath of bundledInputs) {
        const nodeModulesMatch = inputPath.match(
          /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(@[^/]+\/[^/]+|[^@/][^/]*)/
        );
        if (nodeModulesMatch) {
          const pkgName = nodeModulesMatch[1];
          if (!nodeBuiltins.has(pkgName) && !externalsMap[pkgName]) {
            transitiveDeps.add(pkgName);
          }
        }
      }

      console.log('[shared-deps] Transitive deps (bundled, not externalized):', transitiveDeps.size);
    }

    console.log('[shared-deps] Total externalsMap entries:', Object.keys(externalsMap).length);

    const meta = {
      depsCount: existingPackages.length,
      deps: existingPackages,
      externalsMap,
      cacheKey,
      totalExternalized: Object.keys(externalsMap).length,
    };
    writeFileSync(metaPath, JSON.stringify(meta, null, 2));

    return {
      bundlePath,
      publicPath,
      externalsMap,
      timeTaken: Date.now() - startTime,
      depsCount: existingPackages.length,
    };
  } catch (error) {
    console.error('[shared-deps] Bundling failed:', error);
    return {
      bundlePath: '',
      publicPath: '',
      externalsMap: {},
      timeTaken: Date.now() - startTime,
      depsCount: 0,
    };
  }
}

/**
 * Collect host dependencies from environments using Bit's API
 * These are the "singleton" dependencies that must be shared across all components
 */
export function collectHostDependencies(
  contexts: Array<{ envDefinition: { env: any } }>,
  dependencyResolver: { getPreviewHostDependenciesFromEnv: (env: any) => Promise<string[]> }
): Promise<string[]> {
  return Promise.all(
    contexts.map((ctx) => dependencyResolver.getPreviewHostDependenciesFromEnv(ctx.envDefinition.env))
  ).then((depArrays) => {
    const allDeps = new Set<string>();
    depArrays.flat().forEach((dep) => allDeps.add(dep));
    return Array.from(allDeps);
  });
}

/**
 * Collect peer dependencies from environments using the dependency resolver API
 * All components of an environment share the same peer deps, so they're safe to externalize
 * @returns Array of package names that are peer dependencies defined by environments
 */
export async function collectEnvPeerDependencies(
  contexts: Array<{ envDefinition: { id: string; env: any } }>,
  dependencyResolver: {
    getComponentEnvPolicyFromEnvDefinition: (envDef: { id: string; env: any }) => Promise<{
      byLifecycleType: (type: string) => { entries: Array<{ dependencyId: string; value: { version: string } }> };
    }>;
  }
): Promise<string[]> {
  const allPeers = new Set<string>();

  for (const ctx of contexts) {
    try {
      const envPolicy = await dependencyResolver.getComponentEnvPolicyFromEnvDefinition(ctx.envDefinition);
      const peerPolicy = envPolicy.byLifecycleType('peer');

      for (const entry of peerPolicy.entries) {
        // Only include the package name, not version
        const pkgName = entry.dependencyId;
        // Skip Bit internal packages
        if (!pkgName.startsWith('@teambit/') && !pkgName.includes('.')) {
          allPeers.add(pkgName);
        }
      }
    } catch {
      // Environment might not have getDependencies method, skip
      console.log('[collectEnvPeerDependencies] Could not get policy for', ctx.envDefinition.id);
    }
  }

  console.log('[collectEnvPeerDependencies] Collected', allPeers.size, 'peer deps from environments');
  return Array.from(allPeers);
}

/**
 * Check if a package name indicates a build/dev/test tool (not a runtime dependency)
 * These packages should NOT be included in the shared deps bundle
 */
function isDevToolPackage(pkgName: string): boolean {
  // Patterns that indicate build/dev/test tools, NOT runtime dependencies
  return (
    // Build tools
    pkgName.startsWith('@babel/') ||
    pkgName.startsWith('@typescript-eslint/') ||
    pkgName.startsWith('eslint') ||
    pkgName.startsWith('@eslint/') ||
    pkgName.startsWith('typescript') ||
    pkgName.startsWith('@types/') ||
    pkgName.startsWith('prettier') ||
    pkgName === 'tslib' ||
    pkgName.includes('webpack') ||
    pkgName.includes('rollup') ||
    pkgName.includes('vite') ||
    pkgName.includes('esbuild') ||
    pkgName.includes('swc') ||
    // Testing libraries - depend on Jest globals like `expect`
    pkgName.startsWith('@testing-library/') ||
    pkgName.startsWith('vitest') ||
    pkgName.startsWith('@vitest/') ||
    pkgName.startsWith('jest') ||
    pkgName.startsWith('@jest/') ||
    pkgName === 'jest-axe' ||
    pkgName === 'jest-environment-jsdom' ||
    pkgName === 'jsdom' ||
    pkgName === 'react-test-renderer'
  );
}

/**
 * Collect dependencies from environment template modules (mounter, docsTemplate)
 * These are browser-safe since they render React components in the browser
 * Only collect RUNTIME dependencies, not build tools
 */
export async function collectTemplateDependencies(
  contexts: Array<{ envDefinition: { env: any }; envRuntime?: { env: any } }>,
  rootDir: string
): Promise<string[]> {
  const deps = new Set<string>();
  const fs = require('fs');
  const path = require('path');

  for (const ctx of contexts) {
    const env = ctx.envRuntime?.env || ctx.envDefinition.env;

    // Get template module paths from the environment
    const templatePaths: string[] = [];
    try {
      if (typeof env.getMounter === 'function') {
        templatePaths.push(env.getMounter());
      }
      if (typeof env.getDocsTemplate === 'function') {
        templatePaths.push(env.getDocsTemplate());
      }
    } catch {
      // Env doesn't have template methods, skip
      continue;
    }

    // For each template, find its package.json and collect dependencies
    for (const templatePath of templatePaths) {
      try {
        const resolved = require.resolve(templatePath, { paths: [rootDir] });
        let dir = path.dirname(resolved);

        // Walk up to find package.json
        for (let i = 0; i < 10; i++) {
          const pkgJsonPath = path.join(dir, 'package.json');
          if (fs.existsSync(pkgJsonPath)) {
            const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
            // ONLY collect direct dependencies (runtime deps)
            // peerDependencies often include build tools
            const runtimeDeps = pkgJson.dependencies || {};
            Object.keys(runtimeDeps).forEach((dep) => {
              // Skip Bit internal packages - they're bundled separately
              if (dep.startsWith('@teambit/')) return;
              // Skip build/dev tools that ended up in dependencies
              if (isDevToolPackage(dep)) return;
              deps.add(dep);
            });
            break;
          }
          const parent = path.dirname(dir);
          if (parent === dir) break;
          dir = parent;
        }
      } catch {
        // Template not resolvable, skip
      }
    }
  }

  console.log('[collectTemplateDependencies] Collected', deps.size, 'packages from templates');
  return Array.from(deps);
}

/**
 * Collect ALL dependencies from components using Bit's dependency resolver API
 * This is the data-driven approach - we collect what components actually use
 */
export async function collectCommonDependencies(
  contexts: ExecutionContext[],
  dependencyResolver: DependencyResolverMain,
  minUsageCount: number = 1
): Promise<string[]> {
  const depUsageCount: Record<string, number> = {};
  const allComponents: Component[] = [];

  // Get core Bit packages using the API - these are bundled per-env
  // Must be defined before the loop that uses it
  const coreAspectPackages = new Set(dependencyResolver.getCoreAspectPackageNames());
  console.log('[collectCommonDependencies] Core aspect packages:', coreAspectPackages.size);

  // Collect ONLY the components being previewed, not environments or infrastructure
  // We use the coreAspectPackages to identify infrastructure components
  // Any component whose package name is in coreAspectPackages is infrastructure, not application code
  for (const context of contexts) {
    if (context.components) {
      const envId = context.envDefinition?.id;
      for (const component of context.components) {
        const componentId = component.id.toStringWithoutVersion();

        // Skip if this component IS the environment itself
        if (componentId === envId) {
          console.log('[collectCommonDependencies] Skipping environment component:', componentId);
          continue;
        }

        // Use the API: Get the package name and check if it's a core aspect
        // Core aspects are infrastructure (bundlers, envs, etc.) not application code
        const pkgName = dependencyResolver.getPackageName(component);

        // Also check if this component is infrastructure (environment, bundler, etc.)
        // Use component ID patterns to identify infrastructure components
        const isEnvComponent =
          componentId.includes('/environment/') || componentId.includes('/envs/') || componentId.endsWith('-env');

        // Check if component is from an infrastructure scope
        // These components provide build/dev tooling, not runtime application code
        const isInfrastructureScope =
          pkgName.startsWith('@teambit/webpack') ||
          pkgName.startsWith('@teambit/preview') ||
          pkgName.startsWith('@teambit/bundler') ||
          pkgName.startsWith('@teambit/typescript') ||
          pkgName.startsWith('@teambit/babel');

        if (coreAspectPackages.has(pkgName) || isEnvComponent || isInfrastructureScope) {
          console.log('[collectCommonDependencies] Skipping infrastructure component:', componentId);
          continue;
        }

        allComponents.push(component);
      }
    }
  }

  console.log('[collectCommonDependencies] Processing', allComponents.length, 'components');

  // Use the dependency resolver API to get component dependencies
  // Track lifecycle values for debugging
  const lifecycleCounts: Record<string, number> = {};

  for (const component of allComponents) {
    try {
      const depList = dependencyResolver.getDependencies(component);
      if (!depList) continue;

      depList.forEach((dep) => {
        const lifecycle = dep.lifecycle || 'unknown';
        lifecycleCounts[lifecycle] = (lifecycleCounts[lifecycle] || 0) + 1;

        // Include runtime AND peer dependencies - skip only dev deps
        // Peer dependencies are often needed at runtime (react, react-dom, etc.)
        // Dev deps are build tools that are not needed in the browser
        if (lifecycle === 'dev') return;

        const depName = dep.getPackageName?.();
        if (!depName) return;

        // Skip Bit component dependencies using the API
        if (dep.type === 'component') return;

        // Skip core Bit framework packages using the API
        const basePkgName = depName.startsWith('@') ? depName.split('/').slice(0, 2).join('/') : depName.split('/')[0];
        if (coreAspectPackages.has(basePkgName)) return;

        // SKIP testing libraries - they're often listed as peer deps but not needed in browser
        // These packages make the shared bundle unnecessarily large
        const isTestingPackage =
          depName.includes('@testing-library') ||
          depName.includes('jest') ||
          depName.includes('vitest') ||
          depName.includes('mocha') ||
          depName.includes('chai') ||
          depName.includes('enzyme') ||
          depName === 'react-test-renderer' ||
          depName.includes('-test-') ||
          depName.includes('test-utils');

        if (isTestingPackage) {
          // Skip testing packages silently - they're common but not needed at runtime
          return;
        }

        depUsageCount[depName] = (depUsageCount[depName] || 0) + 1;

        // Debug: Log suspicious runtime deps (ones that look like dev tools)
        if (
          depName.includes('babel') ||
          depName.includes('eslint') ||
          depName.includes('webpack') ||
          depName.includes('typescript')
        ) {
          console.log(`[collectCommonDependencies] Suspicious runtime dep: ${depName} from ${component.id.toString()}`);
        }
      });
    } catch {
      continue;
    }
  }

  console.log(
    '[collectCommonDependencies] Lifecycle distribution:',
    lifecycleCounts,
    '(including runtime+peer, excluding dev)'
  );

  // Return deps sorted by usage count
  const commonDeps = Object.entries(depUsageCount)
    .filter(([, count]) => count >= minUsageCount)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  console.log('[collectCommonDependencies] Collected', commonDeps.length, 'packages');
  console.log('[collectCommonDependencies] Top 10:', commonDeps.slice(0, 10));

  return commonDeps;
}

/**
 * Collect dependencies from the preview infrastructure and template modules
 * by analyzing the imports of known preview files
 *
 * This uses a data-driven approach: we trace the imports of the entry modules
 * to find what packages the preview system actually uses
 */
export async function collectPreviewInfrastructureDeps(
  rootDir: string,
  templatePaths: string[] = []
): Promise<string[]> {
  const deps = new Set<string>();

  // Analyze template module dependencies
  // Template modules are part of the preview infrastructure and their deps should be externalized
  for (const templatePath of templatePaths) {
    try {
      const resolved = require.resolve(templatePath, { paths: [rootDir] });
      // Find the package.json of the template module
      const fs = require('fs');
      const path = require('path');
      let dir = path.dirname(resolved);

      // Walk up to find package.json
      for (let i = 0; i < 10; i++) {
        const pkgJsonPath = path.join(dir, 'package.json');
        if (fs.existsSync(pkgJsonPath)) {
          const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
          // Add both dependencies and peerDependencies of the template
          const allDeps = {
            ...pkgJson.dependencies,
            ...pkgJson.peerDependencies,
          };
          Object.keys(allDeps).forEach((dep) => deps.add(dep));
          break;
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    } catch {
      // Template not found, skip
    }
  }

  console.log('[collectPreviewInfrastructureDeps] Collected', deps.size, 'packages from templates');
  return Array.from(deps);
}

// Backward compatibility
export type PreBundleResult = SharedDepsBundleResult;
export type PreBundleOptions = SharedDepsBundleOptions;
export const preBundleDependencies = createSharedDepsBundle;
