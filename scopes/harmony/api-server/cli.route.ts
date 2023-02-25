import { CLIMain } from '@teambit/cli';
import prettyTime from 'pretty-time';
import { Route, Request, Response } from '@teambit/express';
import { Logger } from '@teambit/logger';

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
    async (req: Request, res: Response, next) => {
      this.logger.debug(`cli server: got request for ${req.params.cmd}`);
      try {
        const command = this.cli.getCommand(req.params.cmd);
        if (!command) throw new Error(`command "${req.params.cmd}" was not found`);
        if (!command.json) throw new Error(`command "${req.params.cmd}" does not have a json method`);
        const body = req.body;
        const { args, options } = body;
        const optsToString = Object.keys(options || {})
          .map((key) => `--${key}`)
          .join(' ');
        this.logger.console(`started a new command: ${req.params.cmd} ${(args || []).join(' ')} ${optsToString}`);
        const startTask = process.hrtime();
        const result = await command?.json(args || [], options || {});
        const duration = prettyTime(process.hrtime(startTask));
        this.logger.consoleSuccess(`command "${req.params.cmd}" had been completed in ${duration}`);
        res.json(result);
      } catch (err: any) {
        this.logger.error(`command "${req.params.cmd}" had failed`, err);
        this.logger.consoleFailure(`command "${req.params.cmd}" had failed. ${err.message}`);
        next(err);
      }
    },
  ];
}
