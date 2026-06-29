import type { Route, Request, Response } from '@teambit/express';
import { Verb, validateBody } from '@teambit/express';
import type { Logger } from '@teambit/logger';
import { z } from 'zod';
import type { LanesMain } from './lanes.main.runtime';

const restoreLaneBodySchema = () =>
  z
    .object({
      hash: z.string().min(1),
    })
    .passthrough();

export class LanesRestoreRoute implements Route {
  constructor(
    private lanes: LanesMain,
    private logger: Logger
  ) {}

  method = 'post';
  route = this.lanes.restoreRoutePath;
  verb = Verb.WRITE;

  middlewares = [
    validateBody(restoreLaneBodySchema),
    async (req: Request, res: Response) => {
      const { body } = req;
      const laneHash = body.hash;
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
