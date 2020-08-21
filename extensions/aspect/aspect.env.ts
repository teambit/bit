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

  getCompiler() {
    return this.reactEnv.getCompiler();
  }
}
