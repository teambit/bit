import { execFile } from 'child_process';
import { parse, join } from 'path';
import type { Logger } from '@teambit/logger';
import type { ReactEnv } from '@teambit/react';
import type { Application, DeployFn, AppBuildContext, AppContext, ApplicationInstance } from '@teambit/application';
import { Port } from '@teambit/toolbox.network.get-port';
import type { NodeEnv } from './node.env';
import type { DeployContext, NodeAppMetadata } from './node-app-options';

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

  async run(context: AppContext): Promise<ApplicationInstance> {
    const logger = this.logger;
    const [from, to] = this.portRange;
    const port = context.port || (await Port.getPort(from, to));
    const child = execFile('node', [this.entry, port.toString()], (error) => {
      if (error) {
        // @todo: this is causing uncaughtException in the main process. a better way to handle this would be to use promise.
        // however, since it expects to return a number, it would require a bigger refactor.
        throw error as Error;
      }
    });
    child.stdout?.on('data', function (data) {
      logger.console(data.toString());
    });

    this.logger.console(`${context.appName} is listening on http://localhost:${port}`);
    return {
      appName: context.appName,
      port,
    };
  }

  async build(context: AppBuildContext): Promise<DeployContext> {
    const { base } = parse(this.entry);
    const { distDir } = this.nodeEnv.getCompiler();
    const mainFile = join(distDir, base);
    const metadata: NodeAppMetadata = {
      mainFile,
      artifactsDir: context.artifactsDir,
    };
    const deployContext: DeployContext = {
      ...context, // @todo: is this needed?
      mainFile, // @todo: remove this when possible. only metadata should be used.
      metadata,
    };
    return deployContext;
  }
}
