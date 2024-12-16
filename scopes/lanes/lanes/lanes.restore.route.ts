import { Route, Verb, Request, Response } from '@teambit/express';
import { Logger } from '@teambit/logger';
import { LanesMain } from './lanes.main.runtime';

export class LanesRestoreRoute implements Route {
  constructor(
    private lanes: LanesMain,
    private logger: Logger
  ) {}

  method = 'post';
  route = this.lanes.restoreRoutePath;
  verb = Verb.WRITE;

  middlewares = [
    async (req: Request, res: Response) => {
      const { body } = req;
      const laneHash = body.hash;
      if (!laneHash) {
        return res.status(400).send('Missing hash in body');
      }
      try {
        const result = await this.lanes.restoreLane(laneHash);
        return res.json(result);
      } catch (e: any) {
        this.logger.error(e.toString());
        return res.status(500).send(e.toString());
      }
    },
  ];
}
