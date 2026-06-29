import type { Route, Request, Response } from '@teambit/express';
import { Verb, HttpError, validateData } from '@teambit/express';
import { ObjectList } from '@teambit/objects';
import { put } from '@teambit/legacy.scope-api';
import { z } from 'zod';
import type { OnPostPutSlot, ScopeMain } from '../scope.main.runtime';

// permissive on purpose - validate the fields we read, tolerate anything else for cross-version compatibility.
// built lazily (thunk) so `zod` stays out of the cli bootstrap - see validateBody() in @teambit/express.
const pushOptionsSchema = () =>
  z
    .object({
      clientId: z.string().optional(),
      persist: z.boolean().optional(),
    })
    .passthrough();

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
      if (!pushOptionsStr) throw new HttpError('http is missing the push-options header', 400);
      let parsedPushOptions: unknown;
      try {
        parsedPushOptions = JSON.parse(pushOptionsStr as string);
      } catch {
        throw new HttpError('the push-options header is not a valid JSON', 400);
      }
      const pushOptions = validateData(pushOptionsSchema(), parsedPushOptions, 'push-options header');
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
