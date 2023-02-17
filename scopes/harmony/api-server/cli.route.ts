import { CLIMain } from '@teambit/cli';
import { Route, Request, Response } from '@teambit/express';
import { Logger } from '@teambit/logger';

export class CLIRoute implements Route {
  constructor(private logger: Logger, private cli: CLIMain) {}

  method = 'get';
  route = '/cli/:cmd';

  middlewares = [
    async (req: Request, res: Response, next) => {
      this.logger.debug(`cli server: got request for ${req.params.cmd}`);
      try {
        const command = this.cli.getCommand(req.params.cmd);
        if (!command) throw new Error(`command "${req.params.cmd}" was not found`);
        if (!command.json) throw new Error(`command "${req.params.cmd}" does not have a json method`);
        const result = await command?.json([], {});
        this.logger.consoleSuccess(`command "${req.params.cmd}" had been completed`);
        res.json(result);
      } catch (err) {
        this.logger.consoleFailure(`command "${req.params.cmd}" had failed`);
        next(err);
      }
    },
  ];
}
