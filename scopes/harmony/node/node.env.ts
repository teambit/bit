import { Environment } from '@teambit/envs';

export class NodeEnv implements Environment {
  getDependencies() {
    return {
      devDependencies: {
        '@types/jest': '~26.0.9',
      },
    };
  }
}
