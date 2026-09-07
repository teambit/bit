import path from 'path';
import type { RuleSetRule } from '@rspack/core';
import { fallbacks } from '@teambit/webpack';
import { excludeNodeModulesJs } from '@teambit/webpack.modules.exclude-node-modules-js';
import * as stylesRegexps from '@teambit/webpack.modules.style-regexps';

export { RspackManifestPlugin } from 'rspack-manifest-plugin';
export { generateAssetManifest } from '@teambit/rspack.modules.generate-asset-manifest';

export const moduleFileExtensions = [
  'web.mjs',
  'mjs',
  'web.js',
  'js',
  'web.ts',
  'ts',
  'web.tsx',
  'tsx',
  'json',
  'web.jsx',
  'jsx',
];

export const shouldUseSourceMap = process.env.GENERATE_SOURCEMAP === 'true';
export const imageInlineSizeLimit = parseInt(process.env.IMAGE_INLINE_SIZE_LIMIT || '10000');

/**
 * `react-router`/`@remix-run/router` are `react-router-dom`'s own dependencies, not this repo's
 * direct/hoisted ones (unlike `react-router-dom` itself, neither has a flat top-level
 * `node_modules/` entry) - a plain `require.resolve('react-router/package.json')` from this file
 * throws `Cannot find module`. Resolving them with `paths: [reactRouterDomDir]` walks node's lookup
 * from react-router-dom's own directory instead, where they genuinely are (its own nested
 * `node_modules`) - the same copy react-router-dom's own internal `require()`s would already find
 * unaliased, made explicit here so anything importing them bare (confirmed real - the vendor dll's
 * own manifest has a standalone `./react-router/dist/index.js` entry, not only nested under
 * react-router-dom) lands on that identical copy too, not a different peer-resolved one.
 */
function reactRouterAliases(): Record<string, string> {
  const reactRouterDomDir = path.dirname(require.resolve('react-router-dom/package.json'));
  const resolveFromReactRouterDom = (specifier: string) => require.resolve(specifier, { paths: [reactRouterDomDir] });
  return {
    'react-router-dom': reactRouterDomDir,
    'react-router': path.dirname(resolveFromReactRouterDom('react-router/package.json')),
    '@remix-run/router': resolveFromReactRouterDom('@remix-run/router'),
  };
}

export function resolveAlias(opts?: { profile?: boolean }): Record<string, string | false> {
  return {
    // every react/react-dom entry point used at runtime must be listed here, or it escapes
    // the alias and resolves to the importer's own copy — pairing mismatched react versions
    'react/jsx-runtime': require.resolve('react/jsx-runtime'),
    react: require.resolve('react'),
    'react-dom/client': require.resolve('react-dom/client'),
    // resolve the browser entry explicitly — require.resolve runs under node's export
    // conditions and would otherwise pin server.node.js (needs crypto/stream) into web bundles
    'react-dom/server': require.resolve('react-dom/server.browser'),
    'react-dom': require.resolve('react-dom'),
    ...(opts?.profile && {
      'react-dom$': 'react-dom/profiling',
      'scheduler/tracing': 'scheduler/tracing-profiling',
    }),
    // aliased as a *directory* so the subpath entries (`/utilities`, `/link/ws`, `/react/ssr`, …)
    // land in the same copy. apollo carries React context, so a second copy in the bundle silently
    // breaks every `useQuery` - the same reason react is pinned above. It also has to be aliased to
    // resolve at all: it is a peer dependency of `@teambit/component`, so an aspect resolved out of a
    // capsule's pnpm store has no `@apollo/client` anywhere above it.
    '@apollo/client': path.dirname(require.resolve('@apollo/client/package.json')),
    // same reasoning, same fix, confirmed the hard way (2026-09-07, `bundle-plan/18-findings-log.md`):
    // bit's own monorepo carries 4 separately peer-resolved `react-router-dom` copies (paired with
    // every react@18/19 x react-dom@18/19 combination some aspect declares) - an unaliased build that
    // reaches more than one of them (the vendor dll's own compilation does, since different covered
    // aspects each resolve their own peer-matched copy) bakes in two different `useLocation`
    // implementations tied to two different `@remix-run/router` context instances. A component
    // rendered under one copy's `<Router>` while calling the other copy's `useLocation()` throws -
    // not a warning, an uncaught crash, the exact failure mode this alias already prevents for
    // `@apollo/client`. Aliased as a directory (matching the apollo entry above): react-router-dom's
    // own multiple root-level entry points (`main.js`, `index.js`, `server.mjs`) all need to land in
    // the same resolved copy, not just the bare specifier.
    ...reactRouterAliases(),
    '@teambit/component.ui.component-compare.context': require.resolve(
      '@teambit/component.ui.component-compare.context'
    ),
    // carries `ssrBrowserContext`, which the ssr render fills in and `useUserAgent` reads. the ui
    // graph pulls in several versions of this package, and an unaliased copy gives the provider and
    // the consumer two different contexts - the consumer then sees `undefined`, takes the browser
    // fallback, and dereferences `window` while rendering on the server.
    '@teambit/ui-foundation.ui.hooks.use-user-agent': require.resolve('@teambit/ui-foundation.ui.hooks.use-user-agent'),
    '@teambit/base-react.navigation.link': require.resolve('@teambit/base-react.navigation.link'),
    '@teambit/base-ui.graph.tree.recursive-tree': require.resolve('@teambit/base-ui.graph.tree.recursive-tree'),
    '@teambit/semantics.entities.semantic-schema': require.resolve('@teambit/semantics.entities.semantic-schema'),
    '@teambit/code.ui.code-editor': require.resolve('@teambit/code.ui.code-editor'),
    '@teambit/api-reference.hooks.use-api': require.resolve('@teambit/api-reference.hooks.use-api'),
    '@teambit/api-reference.hooks.use-api-renderers': require.resolve('@teambit/api-reference.hooks.use-api-renderers'),
    '@teambit/lanes.hooks.use-lanes': require.resolve('@teambit/lanes.hooks.use-lanes'),
    '@teambit/lanes.entities.lane-diff': require.resolve('@teambit/lanes.entities.lane-diff'),
  };
}

export const resolveFallback = {
  module: false,
  path: fallbacks.path,
  dgram: false,
  dns: false,
  fs: false,
  stream: false,
  http2: false,
  net: false,
  tls: false,
  child_process: false,
  process: fallbacks.process,
} as const;

export const resolveFallbackDev = {
  fs: false,
  path: fallbacks.path,
  stream: false,
  process: fallbacks.process,
} as const;

// Keep CSS module imports webpack-compatible: `import styles from './x.module.scss'`.
export const cssParser = {
  css: { namedExports: false },
  'css/auto': { namedExports: false },
  'css/module': { namedExports: false },
} as const;

export function swcRule(options?: { dev?: boolean; refresh?: boolean }): RuleSetRule {
  return {
    test: /\.(js|mjs|jsx|ts|tsx)$/,
    exclude: excludeNodeModulesJs,
    use: {
      loader: 'builtin:swc-loader',
      options: {
        jsc: {
          parser: { syntax: 'typescript', tsx: true },
          transform: {
            react: {
              runtime: 'automatic',
              ...(options?.dev && { development: true }),
              ...(options?.refresh && { refresh: true }),
            },
          },
          target: 'es2015',
        },
      },
    },
    type: 'javascript/auto' as const,
  };
}

export function sourceMapRule(): RuleSetRule {
  return {
    test: /\.js$/,
    enforce: 'pre' as const,
    include: /node_modules/,
    descriptionData: { componentId: (value: any) => !!value },
    extractSourceMap: true,
  };
}

export function fontRule(): RuleSetRule {
  return {
    test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
    type: 'asset',
    generator: { filename: 'static/fonts/[hash][ext][query]' },
  };
}

export function mjsRule(): RuleSetRule {
  return { test: /\.m?js/, resolve: { fullySpecified: false } };
}

interface StyleRulesOptions {
  sourceMap: boolean;
  /** If provided, postcss-loader is inserted before preprocessing loaders. */
  postCssConfig?: object;
  /** If true, resolve-url-loader is inserted before sass */
  resolveUrlLoader?: boolean;
  /** If true, CSS is emitted as JS exports only (for SSR builds). */
  exportsOnly?: boolean;
}

/**
 * Returns all 6 style rules: CSS, SCSS, LESS — each as modules and non-modules.
 */
export function styleRules(opts: StyleRulesOptions): RuleSetRule[] {
  const postCss = opts.postCssConfig
    ? [{ loader: require.resolve('postcss-loader'), options: opts.postCssConfig }]
    : [];
  const resolveUrl = opts.resolveUrlLoader
    ? [{ loader: require.resolve('resolve-url-loader'), options: { sourceMap: opts.sourceMap } }]
    : [];

  const moduleGenerator = {
    localIdentName: '[name]__[local]--[hash:base64:5]',
    // Keep interop with CJS outputs that use __importDefault(require('*.module.scss')).
    esModule: false,
    ...(opts.exportsOnly && { exportsOnly: true }),
  };
  const regularGenerator = opts.exportsOnly ? { exportsOnly: true } : undefined;

  const sassLoader = { loader: require.resolve('sass-loader'), options: { sourceMap: true } };

  return [
    {
      test: stylesRegexps.cssNoModulesRegex,
      type: 'css',
      use: [...postCss],
      ...(regularGenerator && { generator: regularGenerator }),
      sideEffects: true,
    },
    {
      test: stylesRegexps.cssModuleRegex,
      type: 'css/module',
      use: [...postCss],
      generator: moduleGenerator,
    },
    {
      test: stylesRegexps.sassNoModuleRegex,
      type: 'css',
      use: [...postCss, ...resolveUrl, sassLoader],
      ...(regularGenerator && { generator: regularGenerator }),
      sideEffects: true,
    },
    {
      test: stylesRegexps.sassModuleRegex,
      type: 'css/module',
      use: [...postCss, ...resolveUrl, sassLoader],
      generator: moduleGenerator,
    },
  ];
}
