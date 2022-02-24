import EnvsAspect, { EnvsMain } from '@teambit/envs';
import NodeAspect, { NodeMain } from '@teambit/node';
import { MainRuntime } from '@teambit/cli';
import { EnvWithMochaAspect } from './env-with-mocha.aspect';
import MochaAspect, { MochaMain } from '@teambit/mocha';

export class EnvWithMochaMain {
  static slots = [];
  static dependencies = [EnvsAspect, NodeAspect, MochaAspect];
  static runtime = MainRuntime;
  static async provider([envs, node, mocha]: [EnvsMain, NodeMain, MochaMain]) {
    const tester = mocha.createTester({});
    const testerOverride = envs.override({
      getTester: () => tester,
    });
    const nodeEnv = node.compose([testerOverride]);
    envs.registerEnv(nodeEnv);
    return new EnvWithMochaMain();
  }
}

EnvWithMochaAspect.addRuntime(EnvWithMochaMain);
