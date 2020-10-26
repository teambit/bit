import { BabelMain } from '@teambit/babel';
import { CompilerMain } from '@teambit/compiler';
import { Environment } from '@teambit/environments';
import { PkgMain } from '@teambit/pkg';
// import { merge } from 'lodash';
import { merge } from 'lodash';
import { TsConfigSourceFile } from 'typescript';
import { ReactEnv } from '@teambit/react';
import { TesterMain } from '@teambit/tester';

const tsconfig = require('./typescript/tsconfig.json');

export const AspectEnvType = 'aspect';

/**
 * a component environment built for [Aspects](https://reactjs.org) .
 */
export class AspectEnv implements Environment {
  constructor(
    private reactEnv: ReactEnv,
    private babel: BabelMain,
    private compiler: CompilerMain,
    private tester: TesterMain,
    private pkg: PkgMain
  ) {}

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
