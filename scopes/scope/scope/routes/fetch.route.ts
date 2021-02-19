import { Route, Verb, Request, Response } from '@teambit/express';
import { fetch } from '@teambit/legacy/dist/api/scope';
import { ScopeMain } from '../scope.main.runtime';

export class FetchRoute implements Route {
  constructor(private scope: ScopeMain) {}

  route = '/scope/fetch';
  method = 'post';
  verb = Verb.READ;

  middlewares = [
    async (req: Request, res: Response) => {
      const objectList = await fetch(this.scope.path, req.body.ids, req.body.fetchOptions);
      const pack = objectList.toTar();
      pack.pipe(res as any);
    },
  ];
}
