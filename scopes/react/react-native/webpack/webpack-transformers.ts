import { realpathSync } from 'fs';
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
  const hostRootDir = _context.target?.hostRootDir || _context.hostRootDir;
  let options;
  if (hostRootDir) {
    options = {
      // resolve the host root dir to its real location, as require.resolve is preserve symlink, so we get wrong result otherwise
      paths: [realpathSync(hostRootDir), __dirname],
    };
  }
  const peerAliases = {
    react: require.resolve('react', options),
    'react-dom/server': require.resolve('react-dom/server', options),
    'react-native$': require.resolve('react-native-web', options),
  };

  config.addAliases(peerAliases).addModuleRule(reactNativePackagesRule);

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
