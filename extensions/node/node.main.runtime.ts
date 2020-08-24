import { NodeAspect } from './node.aspect';
import { MainRuntime } from '@teambit/cli';
import { ReactAspect, ReactMain } from '@teambit/react';
import { EnvsMain, EnvsAspect } from '@teambit/environments';
import { NodeEnv } from './node.env';

export class NodeMain {
  // please replace to the nodeJS icon.
  icon() {
    return 'https://static.bit.dev/extensions-icons/node.svg';
  }

  static runtime = MainRuntime;
  static dependencies = [EnvsAspect, ReactAspect];

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const nodeEnv = envs.compose(new NodeEnv(), react.reactEnv);
    envs.registerEnv(nodeEnv);
    return new NodeMain();
  }
}

NodeAspect.addRuntime(NodeMain);
