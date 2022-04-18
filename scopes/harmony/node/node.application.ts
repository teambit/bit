import { execFile } from 'child_process';
import { parse, join } from 'path';
import { Logger } from '@teambit/logger';
import { ReactEnv } from '@teambit/react';
import { Application, DeployFn, AppBuildContext } from '@teambit/application';
import { NodeEnv } from './node.env';
import { DeployContext } from './node-app-options';

export class NodeApp implements Application {
  constructor(
    readonly name: string,
    readonly entry: string,
    readonly portRange: number[],
    readonly nodeEnv: NodeEnv & ReactEnv,
    readonly logger: Logger,
    readonly deploy?: DeployFn
  ) {}

  applicationType = 'node';

  async run(): Promise<void> {
    const logger = this.logger;
    const child = execFile('node', [this.entry], (error) => {
      if (error) {
        throw error;
      }
    });
    child.stdout?.on('data', function (data) {
      logger.console(data.toString());
    });
  }

  async build(context: AppBuildContext): Promise<DeployContext> {
    const { base } = parse(this.entry);
    const { distDir } = this.nodeEnv.getCompiler();
    const entry = join(distDir, base);
    const _context = Object.assign(context, { entry });
    return _context;
  }
}
