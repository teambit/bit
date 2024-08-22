import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Port } from '@teambit/toolbox.network.get-port';
import fs from 'fs-extra';
import { ExpressAspect, ExpressMain } from '@teambit/express';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { LanesAspect, LanesMain } from '@teambit/lanes';
import { RemoveAspect, RemoveMain } from '@teambit/remove';
import { SnappingAspect, SnappingMain } from '@teambit/snapping';
import { GeneratorAspect, GeneratorMain } from '@teambit/generator';
import { ComponentCompareAspect, ComponentCompareMain } from '@teambit/component-compare';
import { ComponentLogAspect, ComponentLogMain } from '@teambit/component-log';
import { WatcherAspect, WatcherMain } from '@teambit/watcher';
import { ConfigAspect, ConfigMain } from '@teambit/config';
import { ExportAspect, ExportMain } from '@teambit/export';
import { CheckoutAspect, CheckoutMain } from '@teambit/checkout';
import { InstallAspect, InstallMain } from '@teambit/install';
import { ImporterAspect, ImporterMain } from '@teambit/importer';
import { Component } from '@teambit/component';
import { WorkspaceAspect, Workspace } from '@teambit/workspace';
import { sendEventsToClients } from '@teambit/harmony.modules.send-server-sent-events';
import cors from 'cors';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import { ApiServerAspect } from './api-server.aspect';
import { CLIRoute } from './cli.route';
import { ServerCmd } from './server.cmd';
import { IDERoute } from './ide.route';
import { APIForIDE } from './api-for-ide';
import { SSEEventsRoute } from './sse-events.route';
import { join } from 'path';
import { CLIRawRoute } from './cli-raw.route';
import { ApplicationAspect, ApplicationMain } from '@teambit/application';
import DeprecationAspect, { DeprecationMain } from '@teambit/deprecation';
import EnvsAspect, { EnvsMain } from '@teambit/envs';

export class ApiServerMain {
  constructor(
    private workspace: Workspace,
    private logger: Logger,
    private express: ExpressMain,
    private watcher: WatcherMain,
    private installer: InstallMain,
    private importer: ImporterMain
  ) {}

  async runApiServer(options: { port: number; compile: boolean }) {
    if (!this.workspace) {
      throw new Error(`unable to run bit-server, the current directory ${process.cwd()} is not a workspace`);
    }

    this.workspace.registerOnComponentChange(
      async (
        component: Component,
        files: string[], // os absolute paths
        removedFiles?: string[] // os absolute paths
      ) => {
        sendEventsToClients('onComponentChange', {
          id: component.id.toStringWithoutVersion(),
          files,
          removedFiles,
        });
      }
    );

    this.workspace.registerOnBitmapChange(async () => {
      const lastModifiedTimestamp = await this.workspace.bitMap.getLastModifiedBitmapThroughBit();
      const secondsPassedSinceLastModified = lastModifiedTimestamp && (Date.now() - lastModifiedTimestamp) / 1000;
      if (secondsPassedSinceLastModified && secondsPassedSinceLastModified > 1) {
        // changes by bit were done more than a second ago, so probably this .bitmap change was done by "git pull"
        this.logger.debug(
          `running import because we assume the .bitmap file has changed due to "git pull", last time it was modified by bit was ${secondsPassedSinceLastModified} seconds ago`
        );
        await this.importer.importCurrentObjects();
      }
      sendEventsToClients('onBitmapChange', {});
    });

    this.workspace.registerOnWorkspaceConfigChange(async () => {
      sendEventsToClients('onWorkspaceConfigChange', {});
    });

    this.workspace.scope.registerOnPostExport(async () => {
      sendEventsToClients('onPostExport', {});
    });

    this.installer.registerPostInstall(async () => {
      sendEventsToClients('onPostInstall', {});
    });

    this.watcher
      .watch({
        preCompile: false,
        compile: options.compile,
      })
      .catch((err) => {
        // don't throw an error, we don't want to break the "run" process
        this.logger.error('watcher found an error', err);
      });

    const port = options.port || (await this.getRandomPort());

    const app = this.express.createApp();

    app.use(
      // @ts-ignore todo: it's not clear what's the issue.
      cors({
        origin(origin, callback) {
          callback(null, true);
        },
        credentials: true,
      })
    );
    app.use(
      '/api/cloud-graphql',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      createProxyMiddleware({
        target: 'https://api.main.lanes.bit.cloud/graphql',
        changeOrigin: true,
        on: {
          error: (err, req, res) => {
            this.logger.error('graphql cloud proxy error', err);
            // @ts-ignore
            res.writeHead(500, {
              'Content-Type': 'text/plain',
            });
            res.end('Something went wrong with the proxy server of bit cloud graphql');
          },
          proxyReq: fixRequestBody,
        },
      })
    );

    const server = await app.listen(port);

    return new Promise((resolve, reject) => {
      server.on('error', (err) => {
        reject(err);
      });
      server.on('listening', () => {
        this.logger.consoleSuccess(`Bit Server is listening on port ${port}`);
        this.writeUsedPort(port);
        resolve(port);
      });
    });
  }

  writeUsedPort(port: number) {
    const filePath = this.getServerPortFilePath();
    fs.writeFileSync(filePath, port.toString());
  }

  async getRandomPort() {
    const startingPort = 3593; // some arbitrary number shy away from the standard 3000
    // get random number in the range of [startingPort, 55500].
    const randomNumber = Math.floor(Math.random() * (55500 - startingPort + 1) + startingPort);
    const port = await Port.getPort(randomNumber, 65500);
    return port;
  }

  async getExistingUsedPort(): Promise<number | undefined> {
    const filePath = this.getServerPortFilePath();
    try {
      const fileContent = await fs.readFile(filePath, 'utf8');
      return parseInt(fileContent, 10);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return undefined;
      }
      throw err;
    }
  }

  private getServerPortFilePath() {
    return join(this.workspace.scope.path, 'server-port.txt');
  }

  static dependencies = [
    CLIAspect,
    WorkspaceAspect,
    LoggerAspect,
    ExpressAspect,
    WatcherAspect,
    SnappingAspect,
    LanesAspect,
    InstallAspect,
    ExportAspect,
    CheckoutAspect,
    ComponentLogAspect,
    ImporterAspect,
    ComponentCompareAspect,
    GeneratorAspect,
    RemoveAspect,
    ConfigAspect,
    ApplicationAspect,
    DeprecationAspect,
    EnvsAspect,
  ];
  static runtime = MainRuntime;
  static async provider([
    cli,
    workspace,
    loggerMain,
    express,
    watcher,
    snapping,
    lanes,
    installer,
    exporter,
    checkout,
    componentLog,
    importer,
    componentCompare,
    generator,
    remove,
    config,
    application,
    deprecation,
    envs,
  ]: [
    CLIMain,
    Workspace,
    LoggerMain,
    ExpressMain,
    WatcherMain,
    SnappingMain,
    LanesMain,
    InstallMain,
    ExportMain,
    CheckoutMain,
    ComponentLogMain,
    ImporterMain,
    ComponentCompareMain,
    GeneratorMain,
    RemoveMain,
    ConfigMain,
    ApplicationMain,
    DeprecationMain,
    EnvsMain
  ]) {
    const logger = loggerMain.createLogger(ApiServerAspect.id);
    const apiServer = new ApiServerMain(workspace, logger, express, watcher, installer, importer);
    cli.register(new ServerCmd(apiServer));

    const apiForIDE = new APIForIDE(
      workspace,
      snapping,
      lanes,
      installer,
      exporter,
      checkout,
      componentLog,
      componentCompare,
      generator,
      remove,
      config,
      application,
      deprecation,
      envs
    );
    const cliRoute = new CLIRoute(logger, cli, apiForIDE);
    const cliRawRoute = new CLIRawRoute(logger, cli, apiForIDE);
    const ideRoute = new IDERoute(logger, apiForIDE);
    const sseEventsRoute = new SSEEventsRoute(logger, cli);
    // register only when the workspace is available. don't register this on a remote-scope, for security reasons.
    if (workspace) {
      express.register([cliRoute, cliRawRoute, ideRoute, sseEventsRoute]);
    }

    return apiServer;
  }
}

ApiServerAspect.addRuntime(ApiServerMain);

export default ApiServerMain;
