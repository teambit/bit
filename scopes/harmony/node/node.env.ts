import { Environment } from '@teambit/environments';

export class NodeEnv implements Environment {
  getDependencies() {
    return {
      devDependencies: {
        '@types/jest': '~26.0.9',
      },
    };
  }
}
