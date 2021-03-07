import { Environment } from '@teambit/envs';

export class NodeEnv implements Environment {
  icon = 'https://static.bit.dev/extensions-icons/nodejs.svg';

  getDependencies() {
    return {
      devDependencies: {
        '@types/jest': '26.0.20',
      },
    };
  }
}
