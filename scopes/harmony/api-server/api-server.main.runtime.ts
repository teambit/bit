import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ExpressAspect, ExpressMain } from '@teambit/express';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { ApiServerAspect } from './api-server.aspect';
import { CLIRoute } from './cli.route';
import { ServerCmd } from './server.cmd';

export class ApiServerMain {
  constructor(private workspace: Workspace, private logger: Logger, private express: ExpressMain) {}

  async runApiServer(options: { port: number }) {
    const port = options.port || 3000;
    await this.express.listen(port);

    this.workspace.watcher
      .watchAll({
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

  static dependencies = [CLIAspect, WorkspaceAspect, LoggerAspect, ExpressAspect];
  static runtime = MainRuntime;
  static async provider([cli, workspace, loggerMain, express]: [CLIMain, Workspace, LoggerMain, ExpressMain]) {
    const logger = loggerMain.createLogger(ApiServerAspect.id);
    const apiServer = new ApiServerMain(workspace, logger, express);
    cli.register(new ServerCmd(apiServer));

    const cliRoute = new CLIRoute(logger, cli);
    express.register([cliRoute]);

    return apiServer;
  }
}

ApiServerAspect.addRuntime(ApiServerMain);

export default ApiServerMain;
