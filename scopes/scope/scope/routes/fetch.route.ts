import { Route, Verb, Request, Response } from '@teambit/express';
import { fetch } from '@teambit/legacy/dist/api/scope';
import { ObjectList } from '@teambit/legacy/dist/scope/objects/object-list';
import { Logger } from '@teambit/logger';
import { promisify } from 'util';
import { pipeline } from 'stream';
import { ScopeMain } from '../scope.main.runtime';

export class FetchRoute implements Route {
  constructor(private scope: ScopeMain, private logger: Logger) {}

  route = '/scope/fetch';
  method = 'post';
  verb = Verb.READ;
  middlewares = [
    async (req: Request, res: Response) => {
      req.setTimeout(this.scope.config.httpTimeOut);
      const preFetchHookP = this.scope.preFetchObjects
        .values()
        .map((fn) => fn({ ids: req.body.ids, fetchOptions: req.body.fetchOptions }, { headers: req.headers }));

      Promise.all(preFetchHookP).catch((err) => {
        this.logger.error('fatal: onPreFetchObjects encountered an error (this error does not stop the process)', err);
      });

      const readable = await fetch(this.scope.path, req.body.ids, req.body.fetchOptions);
      const pack = ObjectList.fromObjectStreamToTar(readable, this.scope.name);
      const pipelinePromise = promisify(pipeline);
      try {
        await pipelinePromise(pack, res);
        this.logger.info('fetch.router, the response has been sent successfully to the client', req.headers);
      } catch (err) {
        if (req.aborted) {
          this.logger.warn('FetchRoute, the client aborted the request', err);
        } else {
          this.logger.error(
            `FetchRoute encountered an error during the pipeline streaming, this should never happen.
  make sure the error is caught in fromObjectStreamToTar and it streamed using the name "ERROR"`,
            err
          );
        }
      }
    },
  ];
}
