import { Environment } from '../environments';
import { ReactEnv } from '../react';

export const AspectEnvType = 'aspect';

/**
 * a component environment built for [Aspects](https://reactjs.org) .
 */
export class AspectEnv implements Environment {
  constructor(private reactEnv: ReactEnv) {}

  async __getDescriptor() {
    return {
      type: AspectEnvType,
    };
  }

  getDependencies() {
    return {
      dependencies: {
        react: '-',
      },
      // TODO: add this only if using ts
      devDependencies: {
        '@types/react': '16.9.43',
        '@types/jest': '~26.0.9',
        '@types/react-router-dom': '^5.1.5',
      },
    };
  }
}
