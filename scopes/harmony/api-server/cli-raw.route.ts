import { CLIMain, CLIParser, YargsExitWorkaround } from '@teambit/cli';
import chalk from 'chalk';
import { Route, Request, Response } from '@teambit/express';
import { Logger } from '@teambit/logger';
import legacyLogger from '@teambit/legacy/dist/logger/logger';
import { reloadFeatureToggle } from '@teambit/harmony.modules.feature-toggle';
import { APIForIDE } from './api-for-ide';

/**
 * example usage:
 * post to http://localhost:3000/api/cli
 * with the following json as the body
 *
{
    "command": ["tag comp1 --build"]
}
 */
export class CLIRawRoute implements Route {
  constructor(private logger: Logger, private cli: CLIMain, private apiForIDE: APIForIDE) {}

  method = 'post';
  route = '/cli-raw';

  middlewares = [
    async (req: Request, res: Response) => {
      const { command, pwd, envBitFeatures } = req.body;
      this.logger.debug(`cli-raw server: got request for ${command}`);
      if (pwd && !process.cwd().startsWith(pwd)) {
        throw new Error(`bit-server is running on a different directory. bit-server: ${process.cwd()}, pwd: ${pwd}`);
      }
      const currentBitFeatures = process.env.BIT_FEATURES;
      const shouldReloadFeatureToggle = currentBitFeatures !== envBitFeatures;
      if (shouldReloadFeatureToggle) {
        process.env.BIT_FEATURES = envBitFeatures;
        reloadFeatureToggle();
      }

      const randomNumber = Math.floor(Math.random() * 10000); // helps to distinguish between commands in the log
      const commandStr = command.join(' ');
      const cmdStrLog = `${randomNumber} ${commandStr}`;
      await this.apiForIDE.logStartCmdHistory(cmdStrLog);
      legacyLogger.isDaemon = true;
      enableChalk();
      const cliParser = new CLIParser(this.cli.commands, this.cli.groups, this.cli.onCommandStartSlot);
      try {
        const commandRunner = await cliParser.parse(command);
        const result = await commandRunner.runCommand(true);
        await this.apiForIDE.logFinishCmdHistory(cmdStrLog, 0);
        res.json(result);
      } catch (err: any) {
        if (err instanceof YargsExitWorkaround) {
          res.json({ data: err.helpMsg, exitCode: err.exitCode });
        } else {
          this.logger.error(`cli-raw server: got an error for ${commandStr}`, err);
          await this.apiForIDE.logFinishCmdHistory(cmdStrLog, 1);
          res.status(500);
          res.jsonp({
            message: err.message,
            error: err,
          });
        }
      } finally {
        this.logger.clearStatusLine();
        // change chalk back to false, otherwise, the IDE will have colors. (this is a global setting)
        chalk.enabled = false;
        if (shouldReloadFeatureToggle) {
          process.env.BIT_FEATURES = currentBitFeatures;
          reloadFeatureToggle();
        }
      }
    },
  ];
}

/**
 * because this gets called from the express server, which gets spawn from a script, chalk defaults to false.
 * changing only the "level" is not enough, it must be enabled as well.
 * only when calling this route from the terminal, we want colors. on the IDE, we don't want colors.
 */
function enableChalk() {
  chalk.enabled = true;
  chalk.level = 3;
}
