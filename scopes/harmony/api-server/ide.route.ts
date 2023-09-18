import prettyTime from 'pretty-time';
import { Route, Request, Response } from '@teambit/express';
import { Logger } from '@teambit/logger';
import { APIForIDE } from './api-for-ide';

/**
 * example usage:
 * post to http://localhost:3000/api/ide/list-dirs
 * with the following json as the body
 *
{
    "args": ["some-args"]
}
 */
export class IDERoute implements Route {
  constructor(private logger: Logger, private apiForIDE: APIForIDE) {}

  method = 'post';
  route = '/ide/:method';

  middlewares = [
    async (req: Request, res: Response) => {
      this.logger.debug(`api-IDE: got request for ${req.params.method}`);
      try {
        if (!this.apiForIDE[req.params.method]) {
          throw new Error(`API "${req.params.method}" was not found`);
        }
        const body = req.body;
        const { args } = body;
        this.logger.console(`started a new api-IDE call: ${req.params.method}, total: ${args?.length || 0} args`);
        const startTask = process.hrtime();
        const result = await this.apiForIDE[req.params.method](...args);
        const duration = prettyTime(process.hrtime(startTask));
        this.logger.consoleSuccess(`api-IDE call: ${req.params.method} had been completed in ${duration}`);
        res.json(result || {});
      } catch (err: any) {
        this.logger.error(`api-IDE call: ${req.params.method} had failed`, err);
        this.logger.consoleFailure(`api-IDE call: ${req.params.method} had failed. ${err.message}`);
        res.status(500).jsonp(err.message);
      }
    },
  ];
}
