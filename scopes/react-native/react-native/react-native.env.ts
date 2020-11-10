import { Configuration } from 'webpack';
import { TsConfigSourceFile } from 'typescript';
import { Environment } from '@teambit/envs';
import { DependenciesPolicy } from '@teambit/dependency-resolver';

export class ReactNativeEnv implements Environment {
  getDependencies(): DependenciesPolicy {
    return {
      dependencies: {
        react: '-',
        'react-native': '-',
      },
      devDependencies: {
        '@types/react-native': '^0.63.2',
        '@types/jest': '~26.0.9',
        '@types/mocha': '-',
      },
      peerDependencies: {
        react: '^16.13.1',
        'react-native': '^0.63.3',
      },
    };
  }
  getTsConfig(): TsConfigSourceFile {
    // @ts-ignore
    return require.resolve('./typescript/tsconfig.json');
  }
  getWebpackConfig(): Configuration {
    return {
      resolve: {
        alias: {
          'react-native': require.resolve('react-native-web'),
        },
      },
    };
  }
}
