import { Environment, DependenciesEnv } from '@teambit/envs';

export const ReactNativeEnvType = 'react-native';

export class ReactNativeEnv implements Environment, DependenciesEnv {

    getDependencies(){
      return {
        dependencies: {
          react: '-',
          'react-dom': '-',
          'react-native': '-',
        },
        devDependencies: {
          react: '-',
          'react-dom': '-',
          'react-native': '-',
          '@types/jest': '^26.0.0',
          '@types/react': '^17.0.8',
          '@types/react-dom': '^17.0.5',
          '@types/react-native': '^0.64.1',
        },
        peerDependencies: {
          react: '^16.8.0 || ^17.0.0',
          'react-dom': '^16.8.0 || ^17.0.0',
          'react-native': '^0.64.1',
          'react-native-web': '^0.16.0',
        },
      };
    }

    async __getDescriptor() {
    return {
      type: ReactNativeEnvType,
    };
  }
}
