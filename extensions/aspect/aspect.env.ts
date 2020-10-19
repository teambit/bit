import { Environment } from '@teambit/environments';
// import { merge } from 'lodash';
import { ReactEnv } from '@teambit/react';

// const tsconfig = require('./typescript/tsconfig.json');

export const AspectEnvType = 'aspect';

/**
 * a component environment built for [Aspects](https://reactjs.org) .
 */
export class AspectEnv implements Environment {
  constructor(private reactEnv: ReactEnv) {}

  icon = 'https://static.bit.dev/extensions-icons/default.svg';

  async __getDescriptor() {
    return {
      type: AspectEnvType,
    };
  }

  getCompiler(tsConfig: any) {
    return this.reactEnv.getCompiler(tsConfig);
  }
}
