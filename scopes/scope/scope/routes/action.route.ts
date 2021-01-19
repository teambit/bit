import { Route, Verb, Request, Response } from '@teambit/express';
import { action } from 'bit-bin/dist/api/scope/lib/action';
import { getAuthDataFromHeader } from 'bit-bin/dist/scope/network/http/http';
import { ScopeMain } from '../scope.main.runtime';

export class ActionRoute implements Route {
  constructor(private scope: ScopeMain) {}

  method = 'post';
  route = '/scope/action';
  verb = Verb.WRITE;

  middlewares = [
    async (req: Request, res: Response) => {
      const authData = getAuthDataFromHeader(req.headers.authorization);
      const result = await action(this.scope.path, req.body.name, req.body.options, authData);
      // in case the result is empty, send `{}` to make it a valid json.
      res.json(result || {});
    },
  ];
}
