import { Route, Request, Response } from '@teambit/express';
import zlib from 'zlib';
import { put } from 'bit-bin/dist/api/scope';
import { ScopeMain } from '../scope.main.runtime';

export class PutRoute implements Route {
  constructor(private scope: ScopeMain) {}

  method = 'post';
  route = '/scope/put';

  middlewares = [
    async (req: Request, res: Response) => {
      console.log('req.body size', req.body.length, 'bytes, ', req.body.length / 1024 / 1024, 'mb.');
      const compsAndLanesObjects = zlib.inflateSync(req.body).toString();
      const ids = await put(
        {
          path: this.scope.path,
          compsAndLanesObjects,
        },
        {}
      );

      res.json(ids);
    },
  ];
}
