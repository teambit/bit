import { Request, Response, Route } from '@teambit/express';
import mime from 'mime';

import { PreviewMain } from './preview.main.runtime';

export class PreviewRoute implements Route {
  constructor(
    /**
     * preview extension.
     */
    private preview: PreviewMain
  ) {}

  route = `/preview/:previewPath(*)`;
  method = 'get';

  middlewares = [
    async (req: Request, res: Response) => {
      // @ts-ignore TODO: @guy please fix.
      const component: any = req.component as any;
      if (!component) throw new Error(`preview failed to get a component object, url ${req.url}`);
      const artifact = await this.preview.getPreview(component);
      // TODO: please fix file path concatenation here.
      const file = artifact.getFile(`public/${req.params.previewPath || 'index.html'}`);
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
