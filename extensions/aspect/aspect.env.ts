import { Environment } from '@teambit/environments';
import { ReactEnv } from '@teambit/react';
import tsconfig from './typescript/tsconfig.json';

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

  getCompiler() {
    return this.reactEnv.getCompiler(tsconfig);
  }
}
