import type { Route, Request, Response } from '@teambit/express';
import { Verb, validateBody } from '@teambit/express';
import type { Logger } from '@teambit/logger';
import { z } from 'zod';
import type { LanesMain } from './lanes.main.runtime';

const createLaneBodySchema = () =>
  z
    .object({
      name: z.string().min(1),
    })
    .passthrough();

export class LanesCreateRoute implements Route {
  constructor(
    private lanes: LanesMain,
    private logger: Logger
  ) {}

  method = 'post';
  route = this.lanes.createRoutePath;
  verb = Verb.WRITE;

  middlewares = [
    validateBody(createLaneBodySchema),
    async (req: Request, res: Response) => {
      const { body } = req;
      const laneName = body.name;
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
