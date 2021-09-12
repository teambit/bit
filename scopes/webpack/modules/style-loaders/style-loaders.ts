import type { RuleSetRule } from 'webpack';
import type { SassLoaderOptions } from 'sass-loader';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import getCSSModuleLocalIdent from 'react-dev-utils/getCSSModuleLocalIdent';
import { allCssRegex, cssRegex, sassRegex, lessRegex } from '@teambit/webpack.modules.style-regexps';

// all deps are rather small (2kb - 50kb)
const styleLoaderPath = require.resolve('style-loader');
// * no need for sourceMaps - loaders respect `devTools` (preferably, 'inline-source-map')
// * miniCssExtractPlugin - (somehow) breaks hot reloading, so using style-loader in dev mode

export type StyleLoadersOptions = {
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

  postcssLoader?: string;
  resolveUrlLoader?: string;
  sassLoader?: string;
  lessLoader?: string;
  cssLoaderOptions?: any;
  injectorOptions?: any;
  /** options for postcss-loader (skipped if undefined) */
  postcssOptions?: any;
  sassLoaderOptions?: SassLoaderOptions;
  lessLoaderOptions?: any;
  resolveUrlOptions?: any;
};

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

export const pureCssLoaders = ({ postcssOptions, styleInjector = 'mini-css-extract-plugin' }: StyleLoadersOptions) => {
  const styleLoaders: RuleSetRule = {
    test: cssRegex,
    use: [
      styleInjector === 'mini-css-extract-plugin' ? MiniCssExtractPlugin.loader : styleLoaderPath,
      {
        loader: require.resolve('css-loader'),
        options: {
          importLoaders: 3,
          modules: {
            auto: true, // handle *.module.* as css modules
            getLocalIdent: getCSSModuleLocalIdent, // pretty class names
          },
        },
      },
      postcssOptions && {
        loader: require.resolve('postcss-loader'),
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
