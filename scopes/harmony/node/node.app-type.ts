import type { Logger } from '@teambit/logger';
import type { ApplicationType } from '@teambit/application';
import type { ReactEnv } from '@teambit/react';
import type { NodeEnv } from './node.env';
import { NodeApp } from './node.application';
import type { NodeAppOptions } from './node-app-options';

export class NodeAppType implements ApplicationType<NodeAppOptions> {
  constructor(
    readonly name: string,
    private nodeEnv: NodeEnv & ReactEnv,
    private logger: Logger
  ) {}

  createApp(options: NodeAppOptions) {
    return new NodeApp(
      options.name,
      options.entry,
      options.portRange || [3000, 4000],
      this.nodeEnv,
      this.logger,
      options.deploy
    );
  }
}
