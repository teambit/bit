import { WebpackConfigTransformer, WebpackConfigMutator, WebpackConfigTransformContext } from '@teambit/webpack';

const reactNativePackagesRule = {
  test: /\.(jsx?|tsx?)$/,
  include: [/node_modules\/react-native-/],
  loader: require.resolve('babel-loader'),
  options: {
    cacheDirectory: false,
    presets: [require.resolve('@babel/preset-env'), require.resolve('@babel/preset-react')],
  },
};

/**
 * Transformation to apply for both preview and dev server
 * @param config
 * @param _context
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function commonTransformation(config: WebpackConfigMutator, _context: WebpackConfigTransformContext) {
  config
    .addAliases({
      react: require.resolve('react'),
      'react-dom/server': require.resolve('react-dom/server'),
      'react-native$': require.resolve('react-native-web'),
    })
    .addModuleRule(reactNativePackagesRule);

  return config;
}

/**
 * Transformation for the preview only
 * @param config
 * @param context
 * @returns
 */
export const previewConfigTransformer: WebpackConfigTransformer = (
  config: WebpackConfigMutator,
  context: WebpackConfigTransformContext
) => {
  const newConfig = commonTransformation(config, context);
  return newConfig;
};

/**
 * Transformation for the dev server only
 * @param config
 * @param context
 * @returns
 */
export const devServerConfigTransformer: WebpackConfigTransformer = (
  config: WebpackConfigMutator,
  context: WebpackConfigTransformContext
) => {
  const newConfig = commonTransformation(config, context);
  return newConfig;
};
