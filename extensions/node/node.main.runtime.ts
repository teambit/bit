import { MainRuntime } from '@teambit/cli';
import { EnvsAspect, EnvsMain, Environment } from '@teambit/environments';
import { ReactAspect, ReactMain } from '@teambit/react';

import { NodeAspect } from './node.aspect';
import { NodeEnv } from './node.env';

export class NodeMain {
  // please replace to the nodeJS icon.
  icon() {
    return 'https://static.bit.dev/extensions-icons/nodejs.svg';
  }

  static runtime = MainRuntime;
  static dependencies = [EnvsAspect, ReactAspect];

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const nodeEnv: Environment = envs.merge(new NodeEnv(), react.reactEnv);
    envs.registerEnv(nodeEnv);
    return new NodeMain();
  }
}

NodeAspect.addRuntime(NodeMain);
