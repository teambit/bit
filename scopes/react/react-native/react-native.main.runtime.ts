import { ReactAspect, ReactMain } from '@teambit/react';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { Aspect } from '@teambit/harmony';
import { MainRuntime } from '@teambit/cli';
import { ReactNativeAspect } from './react-native.aspect';

const webpackConfig = require('./webpack/webpack.config');

export class ReactNativeMain {
  static dependencies: Aspect[] = [ReactAspect, EnvsAspect];
  static runtime = MainRuntime;
  static async provider([react, envs]: [ReactMain, EnvsMain]) {
    const reactNativeEnv = react.compose([
      react.overrideDevServerConfig(webpackConfig),
      react.overridePreviewConfig(webpackConfig),
      react.overrideDependencies({
        dependencies: {
          react: '-',
          'react-native': '-',
        },
        devDependencies: {
          '@types/react-native': '^0.63.2',
          '@types/jest': '~26.0.9',
          react: '-',
          'react-native': '-',
          'react-native-web': '0.14.8',
        },
        peerDependencies: {
          react: '^16.13.1',
          'react-native': '^0.63.3',
        },
      }),
    ]);

    envs.registerEnv(reactNativeEnv);

    return new ReactNativeMain();
  }
}

ReactNativeAspect.addRuntime(ReactNativeMain);
