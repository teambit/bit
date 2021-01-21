import { Environment } from '@teambit/envs';

export class ReactNativeEnv implements Environment {
  icon = 'https://static.bit.dev/extensions-icons/react.svg';

  getDependencies() {
    return {
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
    };
  }
}
