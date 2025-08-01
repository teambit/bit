import type { Route, Request, Response } from '@teambit/express';
import { Verb } from '@teambit/express';
import { ObjectList } from '@teambit/objects';
import { put } from '@teambit/legacy.scope-api';
import type { OnPostPutSlot, ScopeMain } from '../scope.main.runtime';

export class PutRoute implements Route {
  constructor(
    private scope: ScopeMain,
    private postPutSlot: OnPostPutSlot
  ) {}

  method = 'post';
  route = '/scope/put';
  verb = Verb.WRITE;

  middlewares = [
    async (req: Request, res: Response) => {
      req.setTimeout(this.scope.config.httpTimeOut);
      const pushOptionsStr = req.headers['push-options'];
      if (!pushOptionsStr) throw new Error('http is missing the push-options header');
      const pushOptions = JSON.parse(pushOptionsStr as string);
      const objectList = await ObjectList.fromTar(req);
      const ids = await put(
        {
          path: this.scope.path,
          objectList,
        },
        pushOptions
      );

      await Promise.all(
        ids.map((id) => {
          return this.scope.resolveComponentId(id);
        })
      );

      res.json(ids);
    },
  ];
}
