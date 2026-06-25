import type { Route, Request, Response } from '@teambit/express';
import { Verb, validateBody } from '@teambit/express';
import type { Logger } from '@teambit/logger';
import { z } from 'zod';
import type { LanesMain } from './lanes.main.runtime';

const deleteLanesBodySchema = z
  .object({
    names: z.array(z.string()),
  })
  .passthrough();

export class LanesDeleteRoute implements Route {
  constructor(
    private lanes: LanesMain,
    private logger: Logger
  ) {}

  method = 'post';
  route = this.lanes.deleteRoutePath;
  verb = Verb.WRITE;

  middlewares = [
    validateBody(deleteLanesBodySchema),
    async (req: Request, res: Response) => {
      const { body } = req;
      const laneNames = body.names;
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
