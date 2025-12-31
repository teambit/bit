import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import { Port } from '@teambit/toolbox.network.get-port';
import fs from 'fs-extra';
import type { ExpressMain } from '@teambit/express';
import { ExpressAspect } from '@teambit/express';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { LanesMain } from '@teambit/lanes';
import { LanesAspect } from '@teambit/lanes';
import type { RemoveMain } from '@teambit/remove';
import { RemoveAspect } from '@teambit/remove';
import type { SnappingMain } from '@teambit/snapping';
import { SnappingAspect } from '@teambit/snapping';
import type { GeneratorMain } from '@teambit/generator';
import { GeneratorAspect } from '@teambit/generator';
import type { ComponentCompareMain } from '@teambit/component-compare';
import { ComponentCompareAspect } from '@teambit/component-compare';
import type { ComponentLogMain } from '@teambit/component-log';
import { ComponentLogAspect } from '@teambit/component-log';
import type { WatcherMain } from '@teambit/watcher';
import { WatcherAspect } from '@teambit/watcher';
import type { ConfigMain } from '@teambit/config';
import { ConfigAspect } from '@teambit/config';
import type { ExportMain } from '@teambit/export';
import { ExportAspect } from '@teambit/export';
import type { CheckoutMain } from '@teambit/checkout';
import { CheckoutAspect } from '@teambit/checkout';
import type { InstallMain } from '@teambit/install';
import { InstallAspect } from '@teambit/install';
import type { ImporterMain } from '@teambit/importer';
import { ImporterAspect } from '@teambit/importer';
import type { Component, ComponentMain } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
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
import { execSync } from 'child_process';
import { CLIRawRoute } from './cli-raw.route';
import type { ApplicationMain } from '@teambit/application';
import { ApplicationAspect } from '@teambit/application';
import type { DeprecationMain } from '@teambit/deprecation';
import { DeprecationAspect } from '@teambit/deprecation';
import type { EnvsMain } from '@teambit/envs';
import { EnvsAspect } from '@teambit/envs';
import { DEFAULT_AUTH_TYPE, Http } from '@teambit/scope.network';
import { getSymphonyUrl } from '@teambit/legacy.constants';
import type { GraphMain } from '@teambit/graph';
import { GraphAspect } from '@teambit/graph';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { SchemaMain } from '@teambit/schema';
import { SchemaAspect } from '@teambit/schema';

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

    await this.watcher.watch({
      preCompile: false,
      compile: options.compile,
    });

    const port = options.port || (await this.getRandomPort());

    const app = this.express.createApp();

    app.use(
      cors({
        origin(origin, callback) {
          callback(null, true);
        },
        credentials: true,
      })
    );
    const proxyHeaders = {
      Authorization: `${DEFAULT_AUTH_TYPE} ${Http.getToken()}`,
      origin: '',
      'user-agent': 'bit-vscode-proxy',
    };
    const symphonyUrl = getSymphonyUrl();
    app.use(
      '/api/cloud-graphql',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      createProxyMiddleware({
        target: `${symphonyUrl}/graphql`,
        changeOrigin: true,
        headers: proxyHeaders,
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

    app.use(
      '/api/cloud-rest',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      createProxyMiddleware({
        target: `${symphonyUrl}`,
        changeOrigin: true,
        headers: proxyHeaders,
        on: {
          proxyRes: (proxyRes) => {
            proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';
          },
          error: (err, req, res) => {
            this.logger.error('rest cloud proxy error', err);
            // @ts-ignore
            res.writeHead(500, {
              'Content-Type': 'text/plain',
            });
            res.end('Something went wrong with the proxy server of bit cloud rest');
          },
          proxyReq: fixRequestBody,
        },
      })
    );

    app.use(
      '/websocket-server/subscriptions',
      createProxyMiddleware({
        on: {
          proxyReqWs: (proxyReq) => {
            Object.entries(proxyHeaders).forEach(([key, value]) => {
              proxyReq.setHeader(key, value);
            });
          },
          error: (err) => {
            this.logger.error('websocket cloud proxy error', err);
          },
        },
        pathFilter: '/',
        target: symphonyUrl,
        ws: true,
        secure: false, // Disable SSL verification for proxy to remote server
        changeOrigin: true,
      })
    );

    const server = await app.listen(port);

    return new Promise((resolve, reject) => {
      server.on('error', (err) => {
        reject(err);
      });
      server.on('listening', () => {
        // important! if you change the message here, change it also in server-forever.ts and also in the vscode extension.
        this.logger.consoleSuccess(`Bit Server is listening on port ${port}`);
        this.writeUsedPort(port);
        this.startParentProcessMonitor();
        resolve(port);
      });
    });
  }

  writeUsedPort(port: number) {
    const filePath = this.getServerPortFilePath();
    fs.writeFileSync(filePath, port.toString());
  }

  /**
   * Monitor the parent process (typically VSCode) and shut down if it dies.
   * When a parent process dies on macOS/Linux, orphaned children get re-parented to PID 1 (init/launchd).
   * By detecting this, we can clean up stale bit server processes that would otherwise run forever.
   */
  private startParentProcessMonitor() {
    const originalPpid = process.ppid;
    const checkInterval = 5000; // Check every 5 seconds

    // Log parent process info at startup
    const parentInfo = this.getProcessInfo(originalPpid);
    this.logger.debug(
      `bit server started. PID: ${process.pid}, Parent PID: ${originalPpid}, Parent command: ${parentInfo}`
    );

    const intervalId = setInterval(() => {
      const currentPpid = process.ppid;
      // If PPID changed to 1, our parent (e.g., VSCode) died and we were re-parented to init
      if (currentPpid === 1 && originalPpid !== 1) {
        this.logger.debug(
          `Parent process died (was PID ${originalPpid}: ${parentInfo}). Current PPID is now 1 (init/launchd). Shutting down bit server.`
        );
        clearInterval(intervalId);
        process.exit(0);
      }
    }, checkInterval);

    // Don't let this interval keep the process alive if everything else is done
    intervalId.unref();
  }

  /**
   * Get the command/path of a process by its PID.
   */
  private getProcessInfo(pid: number): string {
    try {
      if (process.platform === 'win32') {
        // Windows: use wmic
        const output = execSync(`wmic process where processid=${pid} get commandline /format:list`, {
          encoding: 'utf8',
          timeout: 2000,
        });
        const match = output.match(/CommandLine=(.+)/);
        return match ? match[1].trim() : 'unknown';
      } else {
        // macOS/Linux: use ps
        const output = execSync(`ps -o command= -p ${pid}`, { encoding: 'utf8', timeout: 2000 });
        return output.trim() || 'unknown';
      }
    } catch {
      return 'unknown (process may have exited)';
    }
  }

  async getRandomPort() {
    const startingPort = 4000; // we prefer to have the ports between 4000 and 4999.
    // get random number in the range of [startingPort, 4999].
    const randomNumber = Math.floor(Math.random() * (4999 - startingPort + 1) + startingPort);
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
    GraphAspect,
    ScopeAspect,
    ComponentAspect,
    SchemaAspect,
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
    graph,
    scope,
    component,
    schema,
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
    EnvsMain,
    GraphMain,
    ScopeMain,
    ComponentMain,
    SchemaMain,
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
      envs,
      graph,
      scope,
      component,
      schema,
      logger
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
