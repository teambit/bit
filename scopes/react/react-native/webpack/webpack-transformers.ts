import { join } from 'path';
import { WebpackConfigTransformer, WebpackConfigMutator, WebpackConfigTransformContext } from '@teambit/webpack';
import { get, set } from 'lodash';
import { reactNativeAlias } from './react-native-alias';

const reactNativePackagesRule = {
  test: /\.(jsx?|tsx?)$/,
  include: [new RegExp(join('node_modules$', 'react-native-/'))],
  loader: require.resolve('babel-loader'),
  options: {
    cacheDirectory: false,
    presets: [require.resolve('@babel/preset-env'), require.resolve('@babel/preset-react')],
    plugins: [require.resolve('@babel/plugin-proposal-class-properties')],
  },
};

/**
 * Transformation to apply for both preview and dev server
 * @param config
 * @param _context
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function commonTransformation(config: WebpackConfigMutator, _context: WebpackConfigTransformContext) {
  reactNativeAlias(config);
  reactNativeExternal(config);
  config.addModuleRule(reactNativePackagesRule);

  return config;
}

/**
 * expect the react-native to be on the global object with the same name of react-native-web
 * @param config
 * @returns
 */
function reactNativeExternal(config: WebpackConfigMutator) {
  const reactNativeExternalVal = get(config.raw, 'externals.react-native');
  const reactNativeWebExternalVal = get(config.raw, 'externals.react-native-web');
  if (config?.raw?.externals && reactNativeExternalVal && reactNativeWebExternalVal) {
    set(config.raw, 'externals.react-native', reactNativeWebExternalVal);
  }
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
