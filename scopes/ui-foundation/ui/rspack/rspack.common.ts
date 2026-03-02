import type { RuleSetRule } from '@rspack/core';
import { fallbacks } from '@teambit/webpack';
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

export function resolveAlias(opts?: { profile?: boolean }): Record<string, string | false> {
  return {
    'react/jsx-runtime': require.resolve('react/jsx-runtime'),
    react: require.resolve('react'),
    'react-dom/server': require.resolve('react-dom/server'),
    'react-dom': require.resolve('react-dom'),
    ...(opts?.profile && {
      'react-dom$': 'react-dom/profiling',
      'scheduler/tracing': 'scheduler/tracing-profiling',
    }),
    '@teambit/component.ui.component-compare.context': require.resolve(
      '@teambit/component.ui.component-compare.context'
    ),
    '@teambit/base-react.navigation.link': require.resolve('@teambit/base-react.navigation.link'),
    '@teambit/base-ui.graph.tree.recursive-tree': require.resolve('@teambit/base-ui.graph.tree.recursive-tree'),
    '@teambit/semantics.entities.semantic-schema': require.resolve('@teambit/semantics.entities.semantic-schema'),
    '@teambit/code.ui.code-editor': require.resolve('@teambit/code.ui.code-editor'),
    '@teambit/api-reference.hooks.use-api': require.resolve('@teambit/api-reference.hooks.use-api'),
    '@teambit/api-reference.hooks.use-api-renderers': require.resolve('@teambit/api-reference.hooks.use-api-renderers'),
    '@teambit/lanes.hooks.use-lanes': require.resolve('@teambit/lanes.hooks.use-lanes'),
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
    exclude: /node_modules/,
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
