#!/usr/bin/env node
// Rollup-based publish bundler for @teambit/bit.
//
// Per docs/migration/10-publish-bundling.md, this script collapses the bit
// entrypoint into a single ESM file containing the CLI dispatcher, command
// index, aspect manifests, and the small Harmony core. Each aspect's
// `*.main.runtime.[jt]s` is emitted as its own dynamically-imported chunk.
//
// Usage:
//   node scripts/build-publish-bundle.mjs
//   node scripts/build-publish-bundle.mjs --visualize   # writes stats.html
//   node scripts/build-publish-bundle.mjs --no-budget   # skip the 5MB gate
//
// Notes
// -----
// Until chunk 09 (CJS → ESM source migration) lands, the dist files emitted
// by `bit compile` are CJS — Babel rewrites `() => import('./foo')` to
// `() => Promise.resolve().then(() => require('./foo'))`, which Rollup does
// not recognize as a code-split boundary. To preserve code-splitting we drive
// the build from TS sources via `@rollup/plugin-typescript` and resolve
// `@teambit/*` packages by their `source` package.json field (which points
// at the TS entry).

import { rollup } from 'rollup';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';

import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import typescript from '@rollup/plugin-typescript';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

const ENTRY = join(REPO_ROOT, 'scopes/harmony/bit/app.ts');
const OUT_DIR = join(REPO_ROOT, 'dist/bundle');
const ENTRY_FILE = 'bit.mjs';
const ENTRY_BUDGET_BYTES = 5 * 1024 * 1024; // 5MB

const args = new Set(process.argv.slice(2));
const VISUALIZE = args.has('--visualize');
const SKIP_BUDGET = args.has('--no-budget');

// Native bindings and CJS-only third-party deps that must stay external.
// Rollup cannot inline `.node` files; everything in this list is shipped via
// a regular `dependencies` entry on `@teambit/bit`'s package.json.
const NATIVE_EXTERNALS = new Set([
  'fsevents',
  '@lydell/node-pty',
  'node-pty',
  '@swc/css',
  '@parcel/css',
  'lightningcss',
  '@reflink/reflink',
]);

const NATIVE_PREFIXES = [
  '@reflink/reflink-',
  '@lydell/node-pty-',
  '@parcel/css-',
  'lightningcss-',
  '@swc/core-',
];

// Heavy modules that we deliberately keep external (UI runtime / dev-only).
// Pulling these into the entry bundle blows the size budget and serves no
// startup benefit because they're only loaded when their owning aspect runs.
const HEAVY_EXTERNALS = new Set([
  'react',
  'react-dom',
  'react-router-dom',
  'monaco-editor',
  '@apollo/client',
  'graphql',
  '@yarnpkg/cli',
  '@yarnpkg/core',
  '@yarnpkg/plugin-pack',
]);

const NODE_BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]);

function isExternal(id) {
  if (NODE_BUILTINS.has(id)) return true;
  if (id.startsWith('node:')) return true;
  if (NATIVE_EXTERNALS.has(id)) return true;
  if (HEAVY_EXTERNALS.has(id)) return true;
  // External scoped sub-imports (e.g. `@yarnpkg/cli/lib/foo`).
  for (const prefix of [...NATIVE_EXTERNALS, ...HEAVY_EXTERNALS]) {
    if (id.startsWith(`${prefix}/`)) return true;
  }
  // Native bindings — platform-suffixed packages and raw .node files. Rollup
  // can't parse the binary; we ship them via direct `dependencies` instead.
  if (id.endsWith('.node')) return true;
  for (const prefix of NATIVE_PREFIXES) {
    if (id.startsWith(prefix)) return true;
  }
  if (isBrowserPackage(id)) return true;
  return false;
}

// Browser-only asset extensions that show up in UI runtimes. The Node entry
// never renders them — short-circuit to an empty module so Rollup doesn't try
// to parse them and so the entry chunk stays small.
const STUBBED_EXTENSIONS = /\.(scss|sass|less|css|module\.css|svg|png|jpe?g|gif|webp|woff2?|ttf|eot|mdx)$/i;

function stubAssetsPlugin() {
  return {
    name: 'stub-browser-assets',
    resolveId(source) {
      if (STUBBED_EXTENSIONS.test(source)) {
        return { id: source, external: false, moduleSideEffects: false };
      }
      return null;
    },
    load(id) {
      if (STUBBED_EXTENSIONS.test(id)) return 'export default {};';
      return null;
    },
  };
}

// Browser-only files that should never end up in the Node-CLI bundle. We
// stub them to empty modules so Rollup's static graph walk doesn't error
// on missing exports inside UI-only files (e.g. b808f4cf5's WIP
// barrel-split removed `ComponentModel` from the component barrel, but
// some UI-only callers still import it — those callers never load on
// the CLI path at runtime, but Rollup's static analysis doesn't know
// that and errors).
//
// The aspect's UI runtime is genuinely UI-only — it's only loaded when
// `bit start` runs and the harmony resolver calls `aspect.runtimes.ui()`.
// In the Node bundle we never need it.
// Path-based UI patterns: anything matching is always-UI and stubbed.
const UI_FILE_PATTERNS = [
  // UI runtime files of any aspect.
  /\.ui\.runtime\.[mc]?[jt]sx?$/,
  /\.preview\.runtime\.[mc]?[jt]sx?$/,
  /\.compositions\.[mc]?[jt]sx?$/,
  /\.docs\.[mc]?[jt]sx?$/,
  // Browser-only @teambit packages identified by their package name
  // segment: `.ui.`, `.compositions.`, etc.
  /^@teambit\/[\w.-]+\.ui\./,
  /^@teambit\/[\w.-]+\.compositions\./,
  /^@teambit\/[\w.-]+\.docs\./,
  // UI-only repo paths.
  /\/components\/ui\//,
  /\/components\/hooks\//,
  /\/components\/lanes\/ui\//,
];

// Content-based detection for `.tsx` files. Many aspects have `.tsx`
// files that aren't UI runtimes but are React components (e.g.
// `scopes/api-reference/api-reference/api-compare.tsx`). Conversely
// some `.tsx` files are non-UI (e.g. `bundler.service.tsx` is a class
// with no JSX). Decide by inspecting imports: if the file imports
// `react` / `react-dom` / `@teambit/*.ui.*`, treat it as UI.
const UI_IMPORT_RE = /from\s+['"](react|react-dom|@apollo\/client|@teambit\/[\w.-]+\.ui\.|@teambit\/[\w.-]+\.compositions\.)/m;

function isUiPathOnly(id) {
  return UI_FILE_PATTERNS.some((re) => re.test(id));
}

function stubUiFilesPlugin() {
  // Path-cache to avoid re-reading files.
  const uiByPath = new Map();
  function isUiContent(id, src) {
    if (uiByPath.has(id)) return uiByPath.get(id);
    const ui = UI_IMPORT_RE.test(src);
    uiByPath.set(id, ui);
    return ui;
  }
  // The stub uses `syntheticNamedExports` so non-UI files that destructure
  // a stubbed module — e.g. `import { noPreview } from '...static-error'`
  // — still resolve. Each named import gets `undefined`. At runtime
  // those imports never execute on the CLI path (they're inside
  // express middleware / UI server code).
  const STUB = { code: 'export default {};', syntheticNamedExports: 'default', moduleSideEffects: false };
  return {
    name: 'stub-ui-files',
    resolveId(source) {
      if (isUiPathOnly(source)) {
        return { id: source, external: false, moduleSideEffects: false };
      }
      return null;
    },
    load(id) {
      if (isUiPathOnly(id)) return STUB;
      if (/\.tsx$/.test(id)) {
        let src;
        try { src = readFileSync(id, 'utf8'); } catch { return null; }
        if (isUiContent(id, src)) return STUB;
      }
      return null;
    },
  };
}

function redirectDirectAspectImports() {
  // `scopes/harmony/bit/manifests.ts` imports each aspect manifest via the
  // compiled-JS subpath `@teambit/<pkg>/dist/<name>.aspect.js` — a perf
  // shortcut for unbundled runtime (skips the heavy barrel index.ts).
  // For the bundle, that subpath points at babel-compiled JS where
  // `() => import('./<name>.main.runtime')` has already been rewritten
  // to `() => Promise.resolve().then(() => require(...))`, which Rollup
  // doesn't recognise as a dynamic-import boundary. Redirect those
  // subpath imports back to the package barrel so nodeResolve picks the
  // `source` field (TS entry) and Rollup sees the original thunk.
  const RE = /^(@teambit\/[\w-]+)\/dist\/[\w-]+\.aspect\.js$/;
  return {
    name: 'redirect-direct-aspect-imports',
    resolveId(source, importer, options) {
      const m = source.match(RE);
      if (!m) return null;
      return this.resolve(m[1], importer, { ...options, skipSelf: true });
    },
  };
}

// Browser-only @teambit packages that leak into the dep graph via UI runtime
// files. They never run in the Node entry — externalizing keeps them out of
// the bundle and lets node_modules supply them at runtime if the UI runtime
// actually gets loaded (in `bit start` etc.).
const BROWSER_PACKAGE_PATTERNS = [
  /^@teambit\/mdx\./,
  /^@teambit\/documenter\./,
];

function isBrowserPackage(id) {
  for (const re of BROWSER_PACKAGE_PATTERNS) {
    if (re.test(id)) return true;
  }
  return false;
}

function chunkForId(id) {
  // Aspect main/ui runtimes — one chunk per runtime file. We match both TS
  // sources (preferred) and compiled JS so the heuristic still works once
  // chunk 09 swaps in ESM dist output.
  const main = id.match(/[\\/]([\w.-]+)\.main\.runtime\.[jt]sx?$/);
  if (main) return `runtime-${main[1]}`;
  const ui = id.match(/[\\/]([\w.-]+)\.ui\.runtime\.[jt]sx?$/);
  if (ui) return `runtime-ui-${ui[1]}`;
  return undefined;
}

async function build() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const plugins = [
    redirectDirectAspectImports(),
    stubUiFilesPlugin(),
    stubAssetsPlugin(),
    nodeResolve({
      exportConditions: ['node', 'source', 'import', 'require', 'default'],
      // Prefer `source` (TS entry) over `main` (CJS dist). Bit's per-aspect
      // package.json files set `source: index.ts` — picking it lets Rollup
      // see the original `() => import(...)` expressions.
      mainFields: ['source', 'module', 'main'],
      extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.cjs', '.json'],
      preferBuiltins: true,
    }),
    json({ preferConst: true }),
    typescript({
      tsconfig: false,
      compilerOptions: {
        target: 'es2022',
        module: 'esnext',
        moduleResolution: 'node',
        jsx: 'react',
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        resolveJsonModule: true,
        skipLibCheck: true,
        sourceMap: true,
        inlineSources: true,
        // Don't typecheck — `npm run lint` owns that. Rollup just needs the
        // emit.
        noEmitOnError: false,
        strict: false,
        noImplicitAny: false,
      },
      include: [
        join(REPO_ROOT, 'scopes/**/*.ts'),
        join(REPO_ROOT, 'scopes/**/*.tsx'),
        join(REPO_ROOT, 'components/**/*.ts'),
        join(REPO_ROOT, 'components/**/*.tsx'),
      ],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/*.composition.tsx',
        '**/*.docs.mdx',
      ],
      outputToFilesystem: false,
    }),
    commonjs({
      transformMixedEsModules: true,
      ignoreDynamicRequires: false,
      // Some Bit deps use `require('foo/' + name)`-style; mark them so the
      // commonjs plugin doesn't try to bundle the (impossible) wildcard.
      dynamicRequireTargets: [],
    }),
  ];

  if (VISUALIZE) {
    const { visualizer } = await import('rollup-plugin-visualizer');
    plugins.push(
      visualizer({
        filename: join(OUT_DIR, 'stats.html'),
        gzipSize: true,
        brotliSize: true,
        template: 'treemap',
      }),
    );
  }

  console.log(`[build-publish-bundle] entry: ${relative(REPO_ROOT, ENTRY)}`);
  console.log(`[build-publish-bundle] out:   ${relative(REPO_ROOT, OUT_DIR)}`);

  const bundle = await rollup({
    input: ENTRY,
    external: (id) => isExternal(id),
    plugins,
    preserveEntrySignatures: 'allow-extension',
    treeshake: { moduleSideEffects: 'no-external' },
    onwarn(warning, warn) {
      // Suppress noisy circular-dependency warnings from third-party CJS —
      // they're unavoidable in the Bit dep graph and not actionable here.
      if (warning.code === 'CIRCULAR_DEPENDENCY') return;
      if (warning.code === 'THIS_IS_UNDEFINED') return;
      warn(warning);
    },
  });

  const { output } = await bundle.write({
    format: 'esm',
    dir: OUT_DIR,
    entryFileNames: ENTRY_FILE,
    chunkFileNames: 'chunks/[name]-[hash].mjs',
    sourcemap: true,
    sourcemapExcludeSources: false,
    manualChunks(id) {
      return chunkForId(id);
    },
    // Banner makes the bundle directly executable as `bit`.
    banner: '#!/usr/bin/env node',
    hoistTransitiveImports: false,
  });

  await bundle.close();

  return output;
}

function reportAndAssert(output) {
  const entry = output.find((c) => c.type === 'chunk' && c.isEntry);
  const chunks = output.filter((c) => c.type === 'chunk' && !c.isEntry);

  const entryPath = join(OUT_DIR, entry.fileName);
  const entryBytes = statSync(entryPath).size;

  const fmt = (n) => `${(n / 1024).toFixed(1)} KB`;
  console.log('');
  console.log(`[build-publish-bundle] entry  ${entry.fileName.padEnd(28)} ${fmt(entryBytes)}`);
  for (const c of chunks.sort((a, b) => a.fileName.localeCompare(b.fileName))) {
    const size = statSync(join(OUT_DIR, c.fileName)).size;
    console.log(`[build-publish-bundle] chunk  ${c.fileName.padEnd(28)} ${fmt(size)}`);
  }
  console.log('');
  console.log(`[build-publish-bundle] ${chunks.length} chunks emitted`);

  if (SKIP_BUDGET) return;
  if (entryBytes > ENTRY_BUDGET_BYTES) {
    console.error(
      `[build-publish-bundle] ERROR: entry chunk ${fmt(entryBytes)} exceeds budget ${fmt(ENTRY_BUDGET_BYTES)}`,
    );
    console.error(
      `[build-publish-bundle] re-run with --visualize to inspect what landed in the entry`,
    );
    process.exit(1);
  }
}

try {
  const output = await build();
  reportAndAssert(output);
} catch (err) {
  console.error('[build-publish-bundle] failed:', err);
  process.exit(1);
}
