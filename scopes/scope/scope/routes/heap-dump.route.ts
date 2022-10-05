import { Route, Verb, Request, Response } from '@teambit/express';

export class HeapdumpRoute implements Route {
  route = '/scope/heap';
  method = 'post';
  verb = Verb.WRITE;
  middlewares = [
    async (req: Request, res: Response) => {
      // eslint-disable-next-line
      const heapdump = require('heapdump');
      // eslint-disable-next-line
      heapdump.writeSnapshot(Date.now() + '.heapsnapshot');
      return res.send('ok');
    },
  ];
}
