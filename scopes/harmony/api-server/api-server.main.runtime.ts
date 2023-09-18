import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ExpressAspect, ExpressMain } from '@teambit/express';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import LanesAspect, { LanesMain } from '@teambit/lanes';
import SnappingAspect, { SnappingMain } from '@teambit/snapping';
import ComponentLogAspect, { ComponentLogMain } from '@teambit/component-log';
import WatcherAspect, { WatcherMain } from '@teambit/watcher';
import { ExportAspect, ExportMain } from '@teambit/export';
import CheckoutAspect, { CheckoutMain } from '@teambit/checkout';
import InstallAspect, { InstallMain } from '@teambit/install';
import ImporterAspect, { ImporterMain } from '@teambit/importer';
import { Component } from '@teambit/component';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { ApiServerAspect } from './api-server.aspect';
import { CLIRoute } from './cli.route';
import { ServerCmd } from './server.cmd';
import { IDERoute } from './ide.route';
import { APIForIDE } from './api-for-ide';
import { SSEEventsRoute, sendEventsToClients } from './sse-events.route';

export class ApiServerMain {
  constructor(
    private workspace: Workspace,
    private logger: Logger,
    private express: ExpressMain,
    private watcher: WatcherMain,
    private installer: InstallMain,
    private importer: ImporterMain
  ) {}

  async runApiServer(options: { port: number }) {
    const port = options.port || 3000;
    await this.express.listen(port);
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
      const lastModified = await this.workspace.bitMap.getLastModifiedBitmapThroughBit();
      if (lastModified && Date.now() - lastModified > 1000) {
        this.logger.debug(
          `running import because we assume the .bitmap file has changed due to "git pull", last time it was modified by bit was ${
            (Date.now() - lastModified) / 1000
          } seconds ago`
        );
        // changes by bit were done more than a second ago, so probably this .bitmap change was done by "git pull"
        await this.importer.importCurrentObjects();
      }
      sendEventsToClients('onBitmapChange', {});
    });

    this.installer.registerPostInstall(async () => {
      sendEventsToClients('onPostInstall', {});
    });

    this.watcher
      .watch({
        preCompile: false,
      })
      .catch((err) => {
        // don't throw an error, we don't want to break the "run" process
        this.logger.error('watcher found an error', err);
      });

    // never ending promise to not exit the process (is there a better way?)
    return new Promise(() => {
      this.logger.consoleSuccess(`Bit Server is listening on port ${port}`);
    });
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
    ImporterMain
  ]) {
    const logger = loggerMain.createLogger(ApiServerAspect.id);
    const apiServer = new ApiServerMain(workspace, logger, express, watcher, installer, importer);
    cli.register(new ServerCmd(apiServer));

    const cliRoute = new CLIRoute(logger, cli);
    const apiForIDE = new APIForIDE(workspace, snapping, lanes, installer, exporter, checkout, componentLog);
    const vscodeRoute = new IDERoute(logger, apiForIDE);
    const sseEventsRoute = new SSEEventsRoute(logger, cli);
    // register only when the workspace is available. don't register this on a remote-scope, for security reasons.
    if (workspace) {
      express.register([cliRoute, vscodeRoute, sseEventsRoute]);
    }

    return apiServer;
  }
}

ApiServerAspect.addRuntime(ApiServerMain);

export default ApiServerMain;
