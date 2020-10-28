import { Environment } from '@teambit/environments';
import { merge } from 'lodash';
import { TsConfigSourceFile } from 'typescript';
import { ReactEnv } from '@teambit/react';

const tsconfig = require('./typescript/tsconfig.json');

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

  getTsConfig(tsConfig: TsConfigSourceFile) {
    const targetConf = merge(tsconfig, tsConfig);
    return targetConf;
  }

  getCompiler(tsConfig: TsConfigSourceFile) {
    const targetConf = this.getTsConfig(tsConfig);
    return this.reactEnv.getCompiler(targetConf);
  }

  getBuildPipe(tsConfig: TsConfigSourceFile) {
    const targetConfig = this.getTsConfig(tsConfig);
    return this.reactEnv.getBuildPipe(targetConfig);
  }
}
