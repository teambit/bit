import type { RuleSetRule, WebpackPluginInstance } from 'webpack';
import type { Options as SassLoaderOptions } from 'sass-loader';
import _MiniCssExtractPlugin, { PluginOptions } from 'mini-css-extract-plugin';
import getCSSModuleLocalIdent from 'react-dev-utils/getCSSModuleLocalIdent';
import { allCssRegex, cssRegex, sassRegex, lessRegex } from '@teambit/webpack.modules.style-regexps';

// * all deps are rather small (2kb - 50kb) - so it's ok to import both style-loader and miniCss
// * no need for 'sourceMaps' - loaders respect `devTools` (preferably, 'inline-source-map')
// * miniCssExtractPlugin - (somehow) breaks hot reloading, so using style-loader in dev mode

export type WebpackLoader = string;

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
  modules?: boolean | RegExp | ((filename: string) => boolean);

  /** use this explicit css-loader */
  cssLoader?: WebpackLoader;
  /** use this explicit postcssLoader */
  postcssLoader?: WebpackLoader;
  /** use this explicit style-loader */
  styleLoader: WebpackLoader;
  /** use this explicit miniCssExtractPlugin. It will be by default and when styleInjector is `mini-css-extract-plugin` */
  MiniCssExtractPlugin: any;

  /** options for MiniCssExtractPlugin */
  miniCssOptions?: PluginOptions;
  /** override the options of css-loader */
  cssLoaderOptions?: any;
  /** override css injector options */
  injectorOptions?: any;
  /** options for postcss-loader (loader is skipped when undefined) */
  postcssOptions?: any;
};

export type CssDialectOptions = {
  /** loader name or path, override the default resolve-url-loader */
  resolveUrlLoader?: WebpackLoader;
  /** loader name or path, override the default sass-loader */
  sassLoader?: WebpackLoader;
  /** loader name or path, override the default less-loader */
  lessLoader?: WebpackLoader;
  /** override the options for sass loader */
  sassLoaderOptions?: SassLoaderOptions;
  /** override the options for less loader */
  lessLoaderOptions?: any;
  /** override the options for resolveUrl loader */
  resolveUrlOptions?: any;
};

export type StyleLoadersOptions = CssOptions & CssDialectOptions;

/** loaders for css, including dialects (sass and less), postcss, and css-modules */
export const makeStyleLoaders = ({
  styleInjector = 'mini-css-extract-plugin',
  modules = true,

  cssLoader = require.resolve('css-loader'),
  postcssLoader = require.resolve('postcss-loader'),
  resolveUrlLoader = require.resolve('resolve-url-loader'),
  sassLoader = require.resolve('sass-loader'),
  lessLoader = require.resolve('less-loader'),
  styleLoader = require.resolve('style-loader'),
  MiniCssExtractPlugin = _MiniCssExtractPlugin,

  miniCssOptions,
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
          loader: styleInjector === 'mini-css-extract-plugin' ? MiniCssExtractPlugin.loader : styleLoader,
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

  const stylePlugins: WebpackPluginInstance[] = [
    // setting as 'any' because of this error:
    // ts2321 - Excessive stack depth comparing types 'WebpackPluginInstance' and 'MiniCssExtractPlugin'.
    styleInjector === 'mini-css-extract-plugin' && (new MiniCssExtractPlugin(miniCssOptions) as any),
  ].filter(Boolean);

  return {
    styleLoaders,
    stylePlugins,
  };
};

/** loaders for pure css, including css-modules support and postcss but without and dialects (sass, less) */
export const makeCssLoaders = ({
  styleInjector = 'mini-css-extract-plugin',
  modules = true,

  cssLoader = require.resolve('css-loader'),
  postcssLoader = require.resolve('postcss-loader'),
  styleLoader = require.resolve('style-loader'),
  MiniCssExtractPlugin = _MiniCssExtractPlugin,

  miniCssOptions,
  cssLoaderOptions,
  injectorOptions,
  postcssOptions,
}: CssOptions) => {
  const loaders: RuleSetRule = {
    test: cssRegex,
    use: [
      {
        loader: styleInjector === 'mini-css-extract-plugin' ? MiniCssExtractPlugin.loader : styleLoader,
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

  const stylePlugins: WebpackPluginInstance[] = [
    styleInjector === 'mini-css-extract-plugin' && (new MiniCssExtractPlugin(miniCssOptions) as any),
  ].filter(Boolean);

  return {
    styleLoaders: loaders,
    stylePlugins,
  };
};
