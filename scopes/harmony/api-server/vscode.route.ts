import prettyTime from 'pretty-time';
import { Route, Request, Response } from '@teambit/express';
import { Logger } from '@teambit/logger';
import { APIForVSCode } from './api-for-vscode';

/**
 * example usage:
 * post to http://localhost:3000/api/vscode/list-dirs
 * with the following json as the body
 *
{
    "args": ["some-args"]
}
 */
export class VSCodeRoute implements Route {
  constructor(private logger: Logger, private apiForVscode: APIForVSCode) {}

  method = 'post';
  route = '/vscode/:method';

  middlewares = [
    async (req: Request, res: Response) => {
      this.logger.debug(`cli server: got request for ${req.params.method}`);
      try {
        if (!this.apiForVscode[req.params.method]) {
          throw new Error(`API "${req.params.method}" was not found`);
        }
        const body = req.body;
        const { args } = body;
        this.logger.console(`started a new api-vscode call: ${req.params.method}, total: ${args?.length || 0} args`);
        const startTask = process.hrtime();
        const result = await this.apiForVscode[req.params.method](args);
        const duration = prettyTime(process.hrtime(startTask));
        this.logger.consoleSuccess(`api-vscode call: ${req.params.method} had been completed in ${duration}`);
        res.json(result);
      } catch (err: any) {
        this.logger.error(`api-vscode call: ${req.params.method} had failed`, err);
        this.logger.consoleFailure(`api-vscode call: ${req.params.method} had failed. ${err.message}`);
        res.status(500).jsonp(err.message);
      }
    },
  ];
}
