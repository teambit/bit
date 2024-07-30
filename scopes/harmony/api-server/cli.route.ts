import { CLIMain } from '@teambit/cli';
import prettyTime from 'pretty-time';
import chalk from 'chalk';
import { Route, Request, Response } from '@teambit/express';
import { Logger } from '@teambit/logger';
import { camelCase } from 'lodash';
import { APIForIDE } from './api-for-ide';

/**
 * example usage:
 * post to http://localhost:3000/api/cli/list
 * with the following json as the body
 *
{
    "args": ["teambit.workspace"],
    "options": {
        "ids": true
    }
}
 */
export class CLIRoute implements Route {
  constructor(private logger: Logger, private cli: CLIMain, private apiForIDE: APIForIDE) {}

  method = 'post';
  route = '/cli/:cmd';

  middlewares = [
    async (req: Request, res: Response) => {
      this.logger.debug(`cli server: got request for ${req.params.cmd}`);
      let cmdStrLog: string | undefined;
      try {
        const command = this.cli.getCommand(req.params.cmd);
        if (!command) throw new Error(`command "${req.params.cmd}" was not found`);
        const body = req.body;
        const { args, options, format, isTerminal } = body;
        if (format && format !== 'json' && format !== 'report') throw new Error(`format "${format}" is not supported`);
        const outputMethod: 'json' | 'report' = format || 'json';
        if (!command[outputMethod])
          throw new Error(`command "${req.params.cmd}" does not have a ${outputMethod} method`);
        const optsToString = Object.keys(options || {})
          .map((key) => `--${key}`)
          .join(' ');
        const argsStr = args ? ` ${args.join(' ')}` : '';
        const optsStr = optsToString ? ` ${optsToString}` : '';
        const cmdStr = req.params.cmd + argsStr + optsStr;
        if (!isTerminal) this.logger.console(`[*] started a new ${outputMethod} command: ${cmdStr}`);
        const randomNumber = Math.floor(Math.random() * 10000); // helps to distinguish between commands in the log
        cmdStrLog = `${randomNumber} ${cmdStr}`;
        await this.apiForIDE.logStartCmdHistory(cmdStrLog);
        const optionsAsCamelCase = Object.keys(options || {}).reduce((acc, key) => {
          const camelCaseKey = camelCase(key);
          acc[camelCaseKey] = options[key];
          return acc;
        }, {});
        const startTask = process.hrtime();
        // because this gets called from the express server, which gets spawn from a script, chalk defaults to false.
        // changing only the "level" is not enough, it must be enabled as well.
        // only when calling this route from the terminal, we want colors. on the IDE, we don't want colors.
        if (isTerminal) {
          chalk.enabled = true;
          chalk.level = 3;
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const result = await command[outputMethod]!(args || [], optionsAsCamelCase);
        this.logger.clearStatusLine();
        const duration = prettyTime(process.hrtime(startTask));
        if (!isTerminal) this.logger.consoleSuccess(`command "${req.params.cmd}" had been completed in ${duration}`);
        await this.apiForIDE.logFinishCmdHistory(cmdStrLog, 0);
        // change chalk back to false, otherwise, the IDE will have colors. (this is a global setting)
        chalk.enabled = false;
        if (outputMethod === 'json') {
          res.json(result);
        } else {
          const data = typeof result === 'string' ? result : result.data;
          const exitCode = typeof result === 'string' ? 0 : result.code;
          res.json({ data, exitCode });
        }
      } catch (err: any) {
        this.logger.error(`command "${req.params.cmd}" had failed`, err);
        this.logger.consoleFailure(`command "${req.params.cmd}" had failed. ${err.message}`);
        if (cmdStrLog) await this.apiForIDE.logFinishCmdHistory(cmdStrLog, 1);
        chalk.enabled = false;
        res.status(500);
        res.jsonp({
          message: err.message,
          error: err,
        });
      }
    },
  ];
}
