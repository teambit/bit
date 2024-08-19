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
      let ideCallLog: string | undefined;
      try {
        if (!this.apiForIDE[req.params.method]) {
          throw new Error(`API "${req.params.method}" was not found`);
        }
        const body = req.body;
        const { args } = body;
        // don't use "logger.console" here, we don't want these message to pollute cli-raw output
        const msgStart = `[*] started a new api-IDE call: ${req.params.method}, total: ${args?.length || 0} args`;
        this.logger.info(msgStart);
        console.log(msgStart); // eslint-disable-line no-console
        const randomNumber = Math.floor(Math.random() * 10000); // helps to distinguish between commands in the log
        ideCallLog = `${randomNumber} ${req.params.method}(${getArgsAsString(args)})`;
        await this.apiForIDE.logStartCmdHistory(ideCallLog);
        const startTask = process.hrtime();
        const result = await this.apiForIDE[req.params.method](...args);
        const duration = prettyTime(process.hrtime(startTask));
        const msgEnd = `✔ api-IDE call: ${req.params.method} had been completed in ${duration}`;
        this.logger.info(msgEnd);
        console.log(msgEnd); // eslint-disable-line no-console
        await this.apiForIDE.logFinishCmdHistory(ideCallLog, 0);
        res.json(result);
      } catch (err: any) {
        const msgErr = `api-IDE call: ${req.params.method} had failed`;
        this.logger.error(msgErr, err);
        console.error(`api-IDE call: ${req.params.method} had failed. ${err.message}`); // eslint-disable-line no-console
        if (ideCallLog) await this.apiForIDE.logFinishCmdHistory(ideCallLog, 1);
        res.status(500).jsonp(err.message);
      }
    },
  ];
}

function getArgsAsString(args?: any[]) {
  if (!args) return '';
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'number') return arg.toString();
      return JSON.stringify(arg);
    })
    .join(' ');
}
