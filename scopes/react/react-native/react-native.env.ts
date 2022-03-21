import { Environment, DependenciesEnv } from '@teambit/envs';
import type { ReactMain } from '@teambit/react';
import { uniq } from 'lodash';

export const ReactNativeEnvType = 'react-native';

export class ReactNativeEnv implements Environment, DependenciesEnv {
  constructor(private react: ReactMain) {}

  async getHostDependencies() {
    const reactAdditional = await this.react.reactEnv.getAdditionalHostDependencies();
    const currentPeers = Object.keys(this.getDependencies().peerDependencies);
    // We filter react-native as we don't want to bundle it to the web
    return uniq(reactAdditional.concat(currentPeers).filter((dep) => dep !== 'react-native'));
  }

  getDependencies() {
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
        // This is added as dev dep since our jest file transformer uses babel plugins that require this to be installed
        '@babel/runtime': '7.12.18',
        '@types/testing-library__jest-dom': '5.9.5',
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
