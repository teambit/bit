import type { Route, Request, Response } from '@teambit/express';
import { Verb, validateBody } from '@teambit/express';
import type { Logger } from '@teambit/logger';
import { z } from 'zod';
import type { MergeLanesMain } from './merge-lanes.main.runtime';

const checkConflictsBodySchema = z
  .object({
    sourceLane: z.string().min(1),
    targetLane: z.string().min(1),
  })
  .passthrough();

export class LanesCheckConflictsRoute implements Route {
  constructor(
    private mergeLanes: MergeLanesMain,
    private logger: Logger
  ) {}

  method = 'post';
  route = '/lanes/check-conflicts';
  verb = Verb.READ;

  middlewares = [
    validateBody(checkConflictsBodySchema),
    async (req: Request, res: Response) => {
      const { body } = req;
      const sourceLane = body.sourceLane;
      const targetLane = body.targetLane;
      try {
        const { conflicts } = await this.mergeLanes.checkLaneForConflicts(sourceLane, targetLane, {});
        const conflictsOutput = conflicts.map((conflict) => {
          return {
            ...conflict,
            id: conflict.id.toString(),
          };
        });
        return res.json({ conflicts: conflictsOutput });
      } catch (e: any) {
        this.logger.error(e.toString());
        return res.status(500).send(e.toString());
      }
    },
  ];
}
