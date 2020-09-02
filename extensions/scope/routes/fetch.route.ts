import { Route, Request, Response } from '@teambit/express';
import { fetch } from 'bit-bin/dist/api/scope';
import bodyParser from 'body-parser';
import { ScopeMain } from '../scope.main.runtime';

export class FetchRoute implements Route {
  constructor(private scope: ScopeMain) {}

  route = '/scope/fetch';
  method = 'get';

  middlewares = [
    bodyParser.json({ limit: '5000mb' }),
    async (req: Request, res: Response) => {
      const objects = await fetch(this.scope.path, req.body.ids, req.body.noDeps, req.body.idsAreLanes, {});
      res.send(objects.toString());
    },
  ];
}
