import { Route, Verb, Request, Response } from '@teambit/express';
import { remove } from '@teambit/legacy/dist/api/scope';
import { ScopeMain } from '../scope.main.runtime';

export class DeleteRoute implements Route {
  constructor(private scope: ScopeMain) {}

  method = 'post';
  route = '/scope/delete';
  verb = Verb.WRITE;

  middlewares = [
    async (req: Request, res: Response) => {
      req.setTimeout(this.scope.config.httpTimeOut);
      const result = await remove({
        path: this.scope.path,
        ids: req.body.ids,
        force: req.body.force,
        lanes: req.body.lanes,
      });
      res.json(result);
    },
  ];
}
