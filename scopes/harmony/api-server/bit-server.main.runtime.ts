import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import express from 'express';

import { BitServerAspect } from './bit-server.aspect';
import { ServerCmd } from './server.cmd';

export class BitServerMain {
  constructor(private cli: CLIMain, private workspace: Workspace, private logger: Logger) {}

  async runBitServer(options: { port: number }) {
    const app = express();
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    app.get('/cli/:cmd', async (req, res, next) => {
      this.logger.debug(`cli server: got request for ${req.params.cmd}`);
      try {
        const command = this.cli.getCommand(req.params.cmd);
        if (!command) throw new Error(`command "${req.params.cmd}" was not found`);
        if (!command.json) throw new Error(`command "${req.params.cmd}" does not have a json method`);
        const result = await command?.json([], {});
        res.json(result);
      } catch (err) {
        next(err);
      }
    });

    this.workspace.watcher
      .watchAll({
        preCompile: false,
      })
      .catch((err) => {
        // don't throw an error, we don't want to break the "run" process
        this.logger.error('watcher found an error', err);
      });

    return new Promise(() => {
      const port = options.port || 3000;
      app.listen(port, () => {
        this.logger.consoleSuccess(`Bit Server is listening on port ${port}`);
      });
    });
  }

  static dependencies = [CLIAspect, WorkspaceAspect, LoggerAspect];
  static runtime = MainRuntime;
  static async provider([cli, workspace, loggerMain]: [CLIMain, Workspace, LoggerMain]) {
    const logger = loggerMain.createLogger(BitServerAspect.id);
    const bitServer = new BitServerMain(cli, workspace, logger);
    cli.register(new ServerCmd(bitServer));
    return bitServer;
  }
}

BitServerAspect.addRuntime(BitServerMain);

export default BitServerMain;
