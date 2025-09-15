import type { CLIMain } from '@teambit/cli';
import prettyTime from 'pretty-time';
import type { Route, Request, Response } from '@teambit/express';
import type { Logger } from '@teambit/logger';
import { camelCase } from 'lodash';
import type { APIForIDE } from './api-for-ide';

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
  constructor(
    private logger: Logger,
    private cli: CLIMain,
    private apiForIDE: APIForIDE
  ) {}

  method = 'post';
  route = '/cli/:cmd';

  middlewares = [
    async (req: Request, res: Response) => {
      this.logger.debug(`cli server: got request for ${req.params.cmd}`);
      let cmdStrLog: string | undefined;
      try {
        const command = this.cli.getCommandByNameOrAlias(req.params.cmd);
        if (!command) throw new Error(`command "${req.params.cmd}" was not found`);
        const body = req.body;
        const { args, options, format } = body;
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
        // don't use "logger.console" here, we don't want these message to pollute cli-raw output
        const msgStart = `[*] started a new ${outputMethod} command: ${cmdStr}`;
        this.logger.info(msgStart);
        console.log(msgStart); // eslint-disable-line no-console
        const randomNumber = Math.floor(Math.random() * 10000); // helps to distinguish between commands in the log
        cmdStrLog = `${randomNumber} ${cmdStr}`;
        await this.apiForIDE.logStartCmdHistory(cmdStrLog);
        const optionsAsCamelCase = Object.keys(options || {}).reduce((acc, key) => {
          const camelCaseKey = camelCase(key);
          acc[camelCaseKey] = options[key];
          return acc;
        }, {});
        const startTask = process.hrtime();
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const result = await command[outputMethod]!(args || [], optionsAsCamelCase);
        this.logger.clearStatusLine();
        const duration = prettyTime(process.hrtime(startTask));
        const msgEnd = `✔ command "${req.params.cmd}" had been completed in ${duration}`;
        this.logger.info(msgEnd);
        console.log(msgEnd); // eslint-disable-line no-console
        await this.apiForIDE.logFinishCmdHistory(cmdStrLog, 0);
        if (outputMethod === 'json') {
          res.json(result);
        } else {
          const data = typeof result === 'string' ? result : result.data;
          const exitCode = typeof result === 'string' ? 0 : result.code;
          res.json({ data, exitCode });
        }
      } catch (err: any) {
        const msgErr = `command "${req.params.cmd}" had failed. ${err.message}`;
        this.logger.error(msgErr, err);
        console.error(msgErr); // eslint-disable-line no-console
        if (cmdStrLog) await this.apiForIDE.logFinishCmdHistory(cmdStrLog, 1);
        res.status(500);
        res.jsonp({
          message: err.message,
          error: err,
        });
      }
    },
  ];
}
