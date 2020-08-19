import { NodeAspect } from './node.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { ReactExtension } from '../react';
import { Environments } from '../environments';
import { NodeEnv } from './node.env';

export class NodeExtension {
  static id = '@teambit/node';

  // please replace to the nodeJS icon.
  icon() {
    return 'https://static.bit.dev/extensions-icons/react.svg';
  }

  static runtime = MainRuntime;
  static dependencies = [Environments, ReactExtension];

  static async provider([envs, react]: [Environments, ReactExtension]) {
    const nodeEnv = envs.compose(new NodeEnv(), react.reactEnv);
    envs.registerEnv(nodeEnv);
    return new NodeExtension();
  }
}

NodeAspect.addRuntime(NodeMain);
