import type { Route, Request, Response } from '@teambit/express';
import { Verb, validateBody } from '@teambit/express';
import { fetch } from '@teambit/legacy.scope-api';
import { ObjectList } from '@teambit/objects';
import type { Logger } from '@teambit/logger';
// @ts-ignore
import { pipeline } from 'stream/promises';
import { z } from 'zod';
import type { ScopeMain } from '../scope.main.runtime';
import { omit } from 'lodash';

// `fetchOptions` carries many version-specific/deprecated fields, so keep it permissive.
// `type` is optional - legacy fetch() defaults a missing type to 'component' for backward compatibility.
const fetchBodySchema = () =>
  z
    .object({
      ids: z.array(z.string()),
      fetchOptions: z
        .object({
          type: z.string().optional(),
        })
        .passthrough(),
    })
    .passthrough();

export class FetchRoute implements Route {
  constructor(
    private scope: ScopeMain,
    private logger: Logger
  ) {}

  route = '/scope/fetch';
  method = 'post';
  verb = Verb.READ;
  middlewares = [
    validateBody(fetchBodySchema),
    async (req: Request, res: Response) => {
      req.setTimeout(this.scope.config.httpTimeOut);
      const preFetchHookP = this.scope.preFetchObjects
        .values()
        .map((fn) => fn({ ids: req.body.ids, fetchOptions: req.body.fetchOptions }, { headers: req.headers }));

      Promise.all(preFetchHookP).catch((err) => {
        this.logger.error('fatal: onPreFetchObjects encountered an error (this error does not stop the process)', err);
      });

      const readable = await fetch(this.scope.path, req.body.ids, req.body.fetchOptions, req.headers);
      const pack = ObjectList.fromObjectStreamToTar(readable, this.scope.name);
      try {
        await pipeline(pack, res);
        const headers = omit(req.headers, ['cookie', 'authorization']);
        this.logger.info('fetch.router, the response has been sent successfully to the client', headers);
      } catch (err: any) {
        if (req.aborted) {
          this.logger.warn('FetchRoute, the client aborted the request', err);
        } else {
          this.logger.error(
            `FetchRoute encountered an error during the pipeline streaming, this should never happen.
make sure the error is caught in fromObjectStreamToTar and it streamed using the name "ERROR".
error: ${err.message}`,
            err
          );
        }
      }
    },
  ];
}
