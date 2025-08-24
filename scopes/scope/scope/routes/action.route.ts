import type { Route, Request, Response } from '@teambit/express';
import { Verb } from '@teambit/express';
import { action } from '@teambit/legacy.scope-api';
import { getAuthDataFromHeader } from '@teambit/scope.network';
import type { ScopeMain } from '../scope.main.runtime';

export class ActionRoute implements Route {
  constructor(private scope: ScopeMain) {}

  method = 'post';
  route = '/scope/action';
  verb = Verb.WRITE;

  middlewares = [
    async (req: Request, res: Response) => {
      req.setTimeout(this.scope.config.httpTimeOut);
      const authData = getAuthDataFromHeader(req.headers.authorization);
      const result = await action(this.scope.path, req.body.name, req.body.options, authData);
      // in case the result is empty, send `{}` to make it a valid json.
      res.json(result || {});
    },
  ];
}
