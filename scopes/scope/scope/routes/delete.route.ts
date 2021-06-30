import { Route, Verb, Request, Response } from '@teambit/express';
import { ScopeMain } from '../scope.main.runtime';

export class DeleteRoute implements Route {
  constructor(private scope: ScopeMain) {}

  method = 'post';
  route = '/scope/delete';
  verb = Verb.WRITE;

  middlewares = [
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
