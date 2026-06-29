import type { Route, Request, Response } from '@teambit/express';
import { Verb, validateBody } from '@teambit/express';
import { z } from 'zod';
import type { ScopeMain } from '../scope.main.runtime';

const deleteBodySchema = () =>
  z
    .object({
      ids: z.array(z.string()),
      force: z.boolean().optional(),
      lanes: z.boolean().optional(),
    })
    .passthrough();

export class DeleteRoute implements Route {
  constructor(private scope: ScopeMain) {}

  method = 'post';
  route = '/scope/delete';
  verb = Verb.WRITE;

  middlewares = [
    validateBody(deleteBodySchema),
    async (req: Request, res: Response) => {
      const { headers } = req;
      req.setTimeout(this.scope.config.httpTimeOut);
      const result = await this.scope.delete(
        {
          ids: req.body.ids,
          force: req.body.force,
          lanes: req.body.lanes,
        },
        headers
      );
      res.json(result);
    },
  ];
}
