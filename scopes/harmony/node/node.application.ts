import { execFile } from 'child_process';
import { parse, join } from 'path';
import { Logger } from '@teambit/logger';
import { ReactEnv } from '@teambit/react';
import { Application, DeployFn, AppBuildContext } from '@teambit/application';
import { Port } from '@teambit/toolbox.network.get-port';
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

  async run(): Promise<number | undefined> {
    const logger = this.logger;
    const [from, to] = this.portRange;
    const port = await Port.getPort(from, to);
    const child = execFile('node', [this.entry, port.toString()], (error) => {
      if (error) {
        throw error;
      }
    });
    child.stdout?.on('data', function (data) {
      logger.console(data.toString());
    });
    return port;
  }

  async build(context: AppBuildContext): Promise<DeployContext> {
    const { base } = parse(this.entry);
    const { distDir } = this.nodeEnv.getCompiler();
    const mainFile = join(distDir, base);
    const _context = Object.assign(context, { mainFile });
    return _context;
  }
}
