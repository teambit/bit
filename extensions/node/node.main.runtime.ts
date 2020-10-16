import { MainRuntime } from '@teambit/cli';
import { EnvsAspect, EnvsMain } from '@teambit/environments';
import { ReactAspect, ReactMain } from '@teambit/react';
import { NodeAspect } from './node.aspect';
import { NodeEnv } from './node.env';

export class NodeMain {
  constructor(
    private react: ReactMain,

    readonly nodeEnv: NodeEnv,

    private envs: EnvsMain
  ) {}

  icon() {
    return 'https://static.bit.dev/extensions-icons/nodejs.svg';
  }

  /**
   * override the TS config of the React environment.
   */
  overrideTsConfig = this.react.overrideTsConfig;

  static runtime = MainRuntime;
  static dependencies = [EnvsAspect, ReactAspect];

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const nodeEnv: NodeEnv = envs.merge(new NodeEnv(), react.reactEnv);
    envs.registerEnv(nodeEnv);
    return new NodeMain(react, nodeEnv, envs);
  }
}

NodeAspect.addRuntime(NodeMain);
