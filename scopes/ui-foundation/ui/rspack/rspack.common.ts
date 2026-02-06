import type { RuleSetRule, Compiler } from '@rspack/core';
import { fallbacks } from '@teambit/webpack';
import * as stylesRegexps from '@teambit/webpack.modules.style-regexps';

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

export const shouldUseSourceMap = process.env.GENERATE_SOURCEMAP !== 'false';
export const imageInlineSizeLimit = parseInt(process.env.IMAGE_INLINE_SIZE_LIMIT || '10000');

/** Shared resolve.alias for all rspack configs (react, teambit UI packages) */
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
  };
}

/** Full resolve.fallback for production/SSR configs (all Node builtins stubbed) */
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

/** Minimal resolve.fallback for dev config */
export const resolveFallbackDev = {
  fs: false,
  path: fallbacks.path,
  stream: false,
  process: fallbacks.process,
} as const;

/**
 * Simple rspack-compatible manifest plugin (replaces webpack-manifest-plugin which is incompatible with rspack 1.7+).
 * Generates asset-manifest.json with { files: { name: path }, entrypoints: string[] }.
 */
export class RspackManifestPlugin {
  private fileName: string;
  constructor(options: { fileName: string }) {
    this.fileName = options.fileName;
  }

  apply(compiler: Compiler) {
    compiler.hooks.thisCompilation.tap('RspackManifestPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: 'RspackManifestPlugin', stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE },
        () => {
          const files: Record<string, string> = {};
          for (const asset of (compilation as any).getAssets()) {
            if (asset.name) files[asset.name] = `/${asset.name}`;
          }
          const stats = compilation.getStats().toJson({ all: false, entrypoints: true });
          const mainEntry = stats.entrypoints?.main;
          const entrypoints = (mainEntry?.assets || [])
            .map((a: any) => a.name || a)
            .filter((name: string) => !name.endsWith('.map'));

          const manifest = JSON.stringify({ files, entrypoints }, null, 2);
          compilation.emitAsset(this.fileName, new compiler.webpack.sources.RawSource(manifest));
        }
      );
    });
  }
}

/** builtin:swc-loader rule for TS/JSX */
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

/** Source-map-loader for Bit component JS in node_modules */
export function sourceMapRule(): RuleSetRule {
  return {
    test: /\.js$/,
    enforce: 'pre' as const,
    include: /node_modules/,
    descriptionData: { componentId: (value: any) => !!value },
    use: [require.resolve('source-map-loader')],
  };
}

/** Font files rule */
export function fontRule(): RuleSetRule {
  return {
    test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
    type: 'asset',
    generator: { filename: 'static/fonts/[hash][ext][query]' },
  };
}

/** .m?js fullySpecified:false rule */
export function mjsRule(): RuleSetRule {
  return { test: /\.m?js/, resolve: { fullySpecified: false } };
}

interface StyleRulesOptions {
  /** First loader in the chain: 'style-loader' path or CssExtractRspackPlugin.loader */
  styleLoader: string | { loader: string };
  sourceMap: boolean;
  /** If provided, postcss-loader is inserted after css-loader */
  postCssConfig?: object;
  /** If true, resolve-url-loader is inserted before sass/less-loader */
  resolveUrlLoader?: boolean;
}

/**
 * Returns all 6 style rules: CSS, SCSS, LESS — each as modules and non-modules.
 */
export function styleRules(opts: StyleRulesOptions): RuleSetRule[] {
  const first = typeof opts.styleLoader === 'string' ? require.resolve(opts.styleLoader) : opts.styleLoader;
  const postCss = opts.postCssConfig
    ? [{ loader: require.resolve('postcss-loader'), options: opts.postCssConfig }]
    : [];
  const resolveUrl = opts.resolveUrlLoader
    ? [{ loader: require.resolve('resolve-url-loader'), options: { sourceMap: opts.sourceMap } }]
    : [];

  const css = (importLoaders: number, modules?: boolean) => ({
    loader: require.resolve('css-loader'),
    options: {
      importLoaders,
      sourceMap: opts.sourceMap,
      ...(modules && { modules: { localIdentName: '[name]__[local]--[hash:base64:5]' } }),
    },
  });

  const sassLoader = { loader: require.resolve('sass-loader'), options: { sourceMap: true } };
  const lessLoader = { loader: require.resolve('less-loader'), options: { sourceMap: true } };

  return [
    // CSS non-modules
    {
      test: stylesRegexps.cssNoModulesRegex,
      use: [first, css(postCss.length), ...postCss],
      sideEffects: true,
    },
    // CSS modules
    {
      test: stylesRegexps.cssModuleRegex,
      use: [first, css(postCss.length, true), ...postCss],
    },
    // SCSS/SASS non-modules
    {
      test: stylesRegexps.sassNoModuleRegex,
      use: [first, css(postCss.length + resolveUrl.length + 1), ...postCss, ...resolveUrl, sassLoader],
      sideEffects: true,
    },
    // SCSS/SASS modules
    {
      test: stylesRegexps.sassModuleRegex,
      use: [first, css(postCss.length + resolveUrl.length + 1, true), ...postCss, ...resolveUrl, sassLoader],
    },
    // LESS non-modules
    {
      test: stylesRegexps.lessNoModuleRegex,
      use: [first, css(postCss.length + resolveUrl.length + 1), ...postCss, ...resolveUrl, lessLoader],
      sideEffects: true,
    },
    // LESS modules
    {
      test: stylesRegexps.lessModuleRegex,
      use: [first, css(postCss.length + resolveUrl.length + 1, true), ...postCss, ...resolveUrl, lessLoader],
    },
  ];
}
