import { Route, Request, Response } from '@teambit/express';
import { ObjectList } from 'bit-bin/dist/scope/objects/object-list';
import { put } from 'bit-bin/dist/api/scope';
import { OnPostPutSlot, ScopeMain } from '../scope.main.runtime';

export class PutRoute implements Route {
  constructor(private scope: ScopeMain, private postPutSlot: OnPostPutSlot) {}

  method = 'post';
  route = '/scope/put';

  middlewares = [
    async (req: Request, res: Response) => {
      const objectList = await ObjectList.fromTar(req);
      const ids = await put({
        path: this.scope.path,
        objectList,
      });
      const componentIds = await Promise.all(
        ids.map((id) => {
          return this.scope.resolveComponentId(id);
        })
      );

      const fns = this.postPutSlot.values();
      fns.map((fn) => fn(componentIds));

      res.json(ids);
    },
  ];
}
