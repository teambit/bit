import { WebpackConfigMutator } from '@teambit/webpack';
import { get } from 'lodash';

/**
 * set the alias of react-native$ to point to the react-native-web
 * @param config
 * @returns
 */
export function reactNativeAlias(config: WebpackConfigMutator) {
  const reactNativeWebPath = get(config.raw, 'resolve.alias.react-native-web', require.resolve('react-native-web'));
  const newAliases = {
    'react-native$': reactNativeWebPath,
  };
  config.removeAliases(['react-native']);
  config.addAliases(newAliases);
  return config;
}
