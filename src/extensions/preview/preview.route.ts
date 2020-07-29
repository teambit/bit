import mime from 'mime';
import { Route, Request, Response } from '../express';
import { PreviewExtension } from './preview.extension';

export class PreviewRoute implements Route {
  constructor(
    /**
     * preview extension.
     */
    private preview: PreviewExtension
  ) {}

  // TODO: check how to fix wildcard for component
  route = '/preview/(.*)';
  method = 'get';

  middlewares = [
    async (req: Request, res: Response) => {
      // @ts-ignore TODO: @guy please fix.
      const component: any = req.component as any;
      const artifact = await this.preview.getPreview(component);
      // TODO: please fix file path concatenation here.
      const file = artifact.getFile(`public/${req.params.path || 'index.html'}`);
      // TODO: 404 again how to handle.
      if (!file) return res.status(404).jsonp({ error: 'not found' });
      const contents = file.contents;
      const str = `${file.cwd}/${file.path}`;
      const contentType = mime.getType(str);
      if (contentType) res.set('Content-Type', contentType);
      return res.send(contents.toString());
    },
  ];
}
