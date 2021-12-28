import type { RuleSetRule } from 'webpack';
import type { Options as SassLoaderOptions } from 'sass-loader';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import getCSSModuleLocalIdent from 'react-dev-utils/getCSSModuleLocalIdent';
import { allCssRegex, cssRegex, sassRegex, lessRegex } from '@teambit/webpack.modules.style-regexps';

// all deps are rather small (2kb - 50kb)
const styleLoaderPath = require.resolve('style-loader');
// * no need for sourceMaps - loaders respect `devTools` (preferably, 'inline-source-map')
// * miniCssExtractPlugin - (somehow) breaks hot reloading, so using style-loader in dev mode

export type CssOptions = {
  /**
   * type of style injecctor to use.
   * style-loader has better hot reloading support but is inline,
   * mini-css-extract-plugin actually creates css files
   */
  styleInjector?: 'mini-css-extract-plugin' | 'style-loader';
  /**
   * handle *.module.* as css-modules
   * @default true
   */
  modules?: boolean;

  /** override specific path to css-loader */
  cssLoader?: string;

  /** loader name or path, override the default postcss loader */
  postcssLoader?: string;
  /** override the options of css-loader */
  cssLoaderOptions?: any;
  /** override css injector options */
  injectorOptions?: any;
  /** options for postcss-loader (loader is skipped when undefined) */
  postcssOptions?: any;
};

export type CssDialectOptions = {
  /** loader name or path, override the default resolve-url-loader */
  resolveUrlLoader?: string;
  /** loader name or path, override the default sass-loader */
  sassLoader?: string;
  /** loader name or path, override the default less-loader */
  lessLoader?: string;
  /** override the options for sass loader */
  sassLoaderOptions?: SassLoaderOptions;
  /** override the options for less loader */
  lessLoaderOptions?: any;
  /** override the options for resolveUrl loader */
  resolveUrlOptions?: any;
};

export type StyleLoadersOptions = CssOptions & CssDialectOptions;

export const cssLoaders = ({
  styleInjector = 'mini-css-extract-plugin',
  modules = true,

  cssLoader = require.resolve('css-loader'),
  postcssLoader = require.resolve('postcss-loader'),
  resolveUrlLoader = require.resolve('resolve-url-loader'),
  sassLoader = require.resolve('sass-loader'),
  lessLoader = require.resolve('less-loader'),

  cssLoaderOptions,
  injectorOptions,
  postcssOptions,
  sassLoaderOptions,
  lessLoaderOptions,
  resolveUrlOptions,
}: StyleLoadersOptions) => {
  const styleLoaders: RuleSetRule[] = [
    {
      test: allCssRegex,
      // Don't consider CSS imports dead code even if the
      // containing package claims to have no side effects.
      // Remove this when webpack adds a warning or an error for this.
      // See https://github.com/webpack/webpack/issues/6571
      sideEffects: true,
      use: [
        {
          loader: styleInjector === 'mini-css-extract-plugin' ? MiniCssExtractPlugin.loader : styleLoaderPath,
          options: injectorOptions,
        },
        {
          loader: cssLoader,
          options: {
            importLoaders: 3,
            modules: {
              auto: modules,
              getLocalIdent: getCSSModuleLocalIdent, // pretty class names
            },

            ...cssLoaderOptions,
          },
        },
        postcssOptions && {
          loader: postcssLoader,
          options: {
            postcssOptions,
          },
        },
      ],
      rules: [
        // dialects
        {
          test: sassRegex,
          use: [
            {
              loader: resolveUrlLoader,
              options: resolveUrlOptions,
            },
            {
              loader: sassLoader,
              options: sassLoaderOptions,
            },
          ],
        },
        {
          test: lessRegex,
          use: [
            {
              loader: resolveUrlLoader,
              options: resolveUrlOptions,
            },
            {
              loader: lessLoader,
              options: lessLoaderOptions,
            },
          ],
        },
      ],
    },
  ];

  const stylePlugins: any[] = [
    styleInjector === 'mini-css-extract-plugin' && (new MiniCssExtractPlugin() as any),
  ].filter(Boolean);

  return {
    styleLoaders,
    stylePlugins,
  };
};

export const pureCssLoaders = ({
  styleInjector = 'mini-css-extract-plugin',
  modules = true,

  cssLoader = require.resolve('css-loader'),
  postcssLoader = require.resolve('postcss-loader'),

  cssLoaderOptions,
  injectorOptions,
  postcssOptions,
}: CssOptions) => {
  const styleLoaders: RuleSetRule = {
    test: cssRegex,
    use: [
      {
        loader: styleInjector === 'mini-css-extract-plugin' ? MiniCssExtractPlugin.loader : styleLoaderPath,
        options: injectorOptions,
      },
      {
        loader: cssLoader,
        options: {
          importLoaders: 3,
          modules: {
            auto: modules, // handle *.module.* as css modules
            getLocalIdent: getCSSModuleLocalIdent, // pretty class names
          },
          ...cssLoaderOptions,
        },
      },
      postcssOptions && {
        loader: postcssLoader,
        options: {
          postcssOptions,
        },
      },
    ],
  };

  const stylePlugins: any[] = [
    styleInjector === 'mini-css-extract-plugin' && (new MiniCssExtractPlugin() as any),
  ].filter(Boolean);

  return {
    styleLoaders,
    stylePlugins,
  };
};
