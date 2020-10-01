import tarStream from 'tar-stream';
import { Route, Request, Response } from '@teambit/express';
import { fetch } from 'bit-bin/dist/api/scope';
import { ScopeMain } from '../scope.main.runtime';

export class FetchRoute implements Route {
  constructor(private scope: ScopeMain) {}

  route = '/scope/fetch';
  method = 'post';

  middlewares = [
    async (req: Request, res: Response) => {
      const objects = await fetch(this.scope.path, req.body.ids, req.body.noDeps, req.body.idsAreLanes, {});

      const flattenedBufferArray = objects.toFlattenedBufferArray();
      console.log('Http -> close -> flattenedBufferArray, total objects', flattenedBufferArray.length);

      const pack = tarStream.pack();
      flattenedBufferArray.forEach((buf, key) => {
        pack.entry({ name: `my_file_${key.toString()}` }, buf);
      });
      pack.finalize();

      pack.pipe(res);

      // res.send(objects.toString());
    },
  ];
}
