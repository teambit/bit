import { CLIMain } from '@teambit/cli';
import prettyTime from 'pretty-time';
import { Route, Request, Response } from '@teambit/express';
import { Logger } from '@teambit/logger';
import { camelCase } from 'lodash';

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
  constructor(private logger: Logger, private cli: CLIMain) {}

  method = 'post';
  route = '/cli/:cmd';

  middlewares = [
    async (req: Request, res: Response) => {
      this.logger.debug(`cli server: got request for ${req.params.cmd}`);
      try {
        const command = this.cli.getCommand(req.params.cmd);
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
        this.logger.console(
          `started a new ${outputMethod} command: ${req.params.cmd} ${(args || []).join(' ')} ${optsToString}`
        );
        const optionsAsCamelCase = Object.keys(options || {}).reduce((acc, key) => {
          const camelCaseKey = camelCase(key);
          acc[camelCaseKey] = options[key];
          return acc;
        }, {});
        const startTask = process.hrtime();
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const result = await command[outputMethod]!(args || [], optionsAsCamelCase);
        const duration = prettyTime(process.hrtime(startTask));
        this.logger.consoleSuccess(`command "${req.params.cmd}" had been completed in ${duration}`);
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
        res.status(500);
        res.jsonp({
          message: err.message,
          error: err,
        });
      }
    },
  ];
}
