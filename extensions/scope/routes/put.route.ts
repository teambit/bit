import tarStream from 'tar-stream';
import { Route, Request, Response } from '@teambit/express';
import { put } from 'bit-bin/dist/api/scope';
import { BitObject } from 'bit-bin/dist/scope/objects';
import Component from 'bit-bin/dist//scope/models/model-component';
import { ScopeMain } from '../scope.main.runtime';

export class PutRoute implements Route {
  constructor(private scope: ScopeMain) {}

  method = 'post';
  route = '/scope/put';

  middlewares = [
    async (req: Request, res: Response) => {
      console.log('HEADERS', req.headers);
      const extract = tarStream.extract();
      const bitObjects: BitObject[] = await new Promise((resolve, reject) => {
        const objects: BitObject[] = [];
        extract.on('entry', (header, stream, next) => {
          let data = Buffer.from('');
          stream.on('data', function (chunk) {
            data = Buffer.concat([data, chunk]);
          });

          stream.on('end', () => {
            const object = BitObject.parseSync(data);
            objects.push(object);
            data = Buffer.from('');
            next(); // ready for next entry
          });

          stream.on('error', (err) => reject(err));

          stream.resume(); // just auto drain the stream
        });

        extract.on('finish', () => {
          console.log('completed!');
          resolve(objects);
        });

        req.pipe(extract);
      });

      const components = bitObjects.filter((o) => o instanceof Component);
      console.log('PutRoute -> constructor -> components', components);

      throw new Error('stop please!');

      const ids = await put(
        {
          path: this.scope.path,
          compsAndLanesObjects: {},
        },
        {}
      );

      res.json(ids);
    },
  ];
}
