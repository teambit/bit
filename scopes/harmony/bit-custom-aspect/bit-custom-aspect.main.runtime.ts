import AspectAspect, { AspectMain } from '@teambit/aspect';
import { MainRuntime } from '@teambit/cli';
import EnvsAspect, { EnvsMain } from '@teambit/envs';
import MochaAspect, { MochaMain } from '@teambit/mocha';
import { BitCustomAspectAspect } from './bit-custom-aspect.aspect';

export class BitCustomAspectMain {
  static slots = [];
  static dependencies = [EnvsAspect, AspectAspect, MochaAspect];
  static runtime = MainRuntime;
  static async provider([envs, aspect, mocha]: [EnvsMain, AspectMain, MochaMain]) {
    const tester = mocha.createTester({}, aspect.babelConfig);
    const testerOverride = envs.override({
      getTester: () => tester,
    });
    const depsOverride = aspect.overrideDependencies({ devDependencies: { chai: '4.3.0' } });
    const bitCustomAspect = aspect.compose([testerOverride, depsOverride]);
    envs.registerEnv(bitCustomAspect);
    return new BitCustomAspectMain();
  }
}

BitCustomAspectAspect.addRuntime(BitCustomAspectMain);
