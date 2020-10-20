import { Request, Response, Route } from '@teambit/express';
import mime from 'mime';

import { PkgMain } from './pkg.main.runtime';

export class PackageRoute implements Route {
  constructor(
    /**
     * pkg extension.
     */
    private pkg: PkgMain
  ) {}

  route = `/package`;
  method = 'get';

  middlewares = [
    async (req: Request, res: Response) => {
      // @ts-ignore TODO: @guy please fix.
      const component: any = req.component as any;
      const file = await this.pkg.getPackageTarFile(component);
      // TODO: 404 again how to handle.
      if (!file) return res.status(404).jsonp({ error: 'not found' });
      const contents = file.contents;
      const str = `${file.cwd}/${file.path}`;
      const contentType = mime.getType('.tar');
      if (contentType) res.set('Content-Type', contentType);
      // return res.send(contents.toString());
      return res.send(contents);
    },
  ];
}
