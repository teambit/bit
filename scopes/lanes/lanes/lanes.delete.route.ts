import { Route, Verb, Request, Response } from '@teambit/express';
import { Logger } from '@teambit/logger';
import { LanesMain } from './lanes.main.runtime';

export class LanesDeleteRoute implements Route {
  constructor(private lanes: LanesMain, private logger: Logger) {}

  method = 'post';
  route = this.lanes.deleteRoutePath;
  verb = Verb.WRITE;

  middlewares = [
    async (req: Request, res: Response) => {
      const { body } = req;
      const laneNames = body.names;
      if (!laneNames) {
        return res.status(400).send('Missing laneNames in body');
      }
      if (laneNames.length === 0) {
        return res.status(204).send('No laneNames provided to delete');
      }
      try {
        const result = await this.lanes.removeLanes(laneNames);
        return res.json(result);
      } catch (e: any) {
        this.logger.error(e.toString());
        return res.status(500).send(e.toString());
      }
    },
  ];
}
