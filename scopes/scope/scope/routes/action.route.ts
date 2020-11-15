import { Route, Request, Response } from '@teambit/express';
import { action } from 'bit-bin/dist/api/scope/lib/action';
import { ScopeMain } from '../scope.main.runtime';

export class ActionRoute implements Route {
  constructor(private scope: ScopeMain) {}

  method = 'post';
  route = '/scope/action';

  middlewares = [
    async (req: Request, res: Response) => {
      const result = await action(this.scope.path, req.body.name, req.body.options);
      // in case the result is empty, send `{}` to make it a valid json.
      res.json(result || {});
    },
  ];
}
