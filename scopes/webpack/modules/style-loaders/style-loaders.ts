import type { RuleSetRule } from 'webpack';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import getCSSModuleLocalIdent from 'react-dev-utils/getCSSModuleLocalIdent';
import { allCssRegex, cssRegex, sassRegex, lessRegex } from '@teambit/webpack.modules.style-regexps';

// all deps are rather small (2kb - 50kb)
const styleLoaderPath = require.resolve('style-loader');
// * no need for sourceMaps - loaders respect `devTools` (preferably, 'inline-source-map')
// * miniCssExtractPlugin - (somehow) breaks hot reloading, so using style-loader in dev mode

export type StyleLoadersOptions = {
  /** options for postcss-loader (skipped if undefined) */
  postcssOptions?: any;
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
};

export const cssLoaders = ({
  postcssOptions,
  styleInjector = 'mini-css-extract-plugin',
  modules = true,
}: StyleLoadersOptions) => {
  const styleLoaders: RuleSetRule[] = [
    {
      test: allCssRegex,
      use: [
        styleInjector === 'mini-css-extract-plugin' ? MiniCssExtractPlugin.loader : styleLoaderPath,
        {
          loader: require.resolve('css-loader'),
          options: {
            importLoaders: 3,
            modules: {
              auto: modules,
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
      rules: [
        // dialects
        {
          test: sassRegex,
          use: [require.resolve('resolve-url-loader'), require.resolve('sass-loader')],
        },
        {
          test: lessRegex,
          use: [require.resolve('resolve-url-loader'), require.resolve('less-loader')],
        },
      ],
    },
  ];

  const stylePlugins: any[] = [styleInjector === 'mini-css-extract-plugin' && (new MiniCssExtractPlugin() as any)].filter(
    Boolean
  );

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
