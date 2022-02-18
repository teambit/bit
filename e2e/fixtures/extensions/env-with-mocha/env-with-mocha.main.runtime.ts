import { EnvsMain } from '@teambit/envs';
import { NodeMain } from '@teambit/node';
import { MainRuntime } from '@teambit/cli';
import { EnvWithMochaAspect } from './env-with-mocha.aspect';

export class EnvWithMochaMain {
  static slots = [];
  static dependencies = [];
  static runtime = MainRuntime;
  static async provider([envs, node]: [EnvsMain, NodeMain]) {
    const nodeEnv = node.compose([]);
    envs.registerEnv(nodeEnv);
    return new EnvWithMochaMain();
  }
}

EnvWithMochaAspect.addRuntime(EnvWithMochaMain);
