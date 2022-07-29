import { Request, Response, Route } from '@teambit/express';
import mime from 'mime';
import { BuilderMain } from './builder.main.runtime';

export const routePath = `builder`;
export class BuilderRoute implements Route {
  constructor(private builder: BuilderMain) {}

  route = `/${routePath}`;
  method = 'get';

  middlewares = [
    async (req: Request, res: Response) => {
      //   // @ts-ignore TODO: @guy please fix.
      //   const component: any = req.component as any;
      //   const file = await this.builder.getPackageTarFile(component);
      //   // TODO: 404 again how to handle.
      //   if (!file) return res.status(404).jsonp({ error: 'not found' });
      //   const contents = file.contents;
      //   const contentType = mime.getType('.tgz');
      //   res.set('Content-disposition', `attachment; filename=${file.basename}`);
      //   if (contentType) res.set('Content-Type', contentType);
      //   return res.send(contents);
    },
  ];
}
