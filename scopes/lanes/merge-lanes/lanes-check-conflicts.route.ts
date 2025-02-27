import { Route, Verb, Request, Response } from '@teambit/express';
import { Logger } from '@teambit/logger';
import { MergeLanesMain } from './merge-lanes.main.runtime';

export class LanesCheckConflictsRoute implements Route {
  constructor(
    private mergeLanes: MergeLanesMain,
    private logger: Logger
  ) {}

  method = 'post';
  route = '/lanes/check-conflicts';
  verb = Verb.READ;

  middlewares = [
    async (req: Request, res: Response) => {
      const { body } = req;
      const sourceLane = body.sourceLane;
      const targetLane = body.targetLane;
      if (!sourceLane) {
        return res.status(400).send('Missing sourceLane in body');
      }
      if (!targetLane) {
        return res.status(400).send('Missing targetLane in body');
      }
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
