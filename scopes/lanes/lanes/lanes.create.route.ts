import { Route, Verb, Request, Response } from '@teambit/express';
import { Logger } from '@teambit/logger';
import { LanesMain } from './lanes.main.runtime';

export class LanesCreateRoute implements Route {
  constructor(private lanes: LanesMain, private logger: Logger) {}

  method = 'post';
  route = this.lanes.createRoutePath;
  verb = Verb.WRITE;

  middlewares = [
    async (req: Request, res: Response) => {
      const { body } = req;
      const laneName = body.name;
      if (!laneName) {
        return res.status(400).send('Missing laneName in body');
      }
      try {
        const result = await this.lanes.createLane(laneName);
        return res.json(result);
      } catch (e: any) {
        this.logger.error(e.toString());
        return res.status(500).send(e.toString());
      }
    },
  ];
}
