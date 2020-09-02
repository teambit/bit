import { Route, Request, Response } from '@teambit/express';
import { put } from 'bit-bin/dist/api/scope';
import { ScopeMain } from '../scope.main.runtime';

export class PutRoute implements Route {
  constructor(private scope: ScopeMain) {}

  method = 'post';
  route = '/scope/put';

  middlewares = [
    async (req: Request, res: Response) => {
      const ids = await put(
        {
          path: this.scope.path,
          compsAndLanesObjects: req.body,
        },
        {}
      );

      res.json(ids);
    },
  ];
}
