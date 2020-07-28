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
  route = '/preview/:file*';
  method = 'get';

  middlewares = [
    async (req: Request, res: Response) => {
      // @ts-ignore TODO: @guy please fix.
      const component: any = req.component as any;
      const artifact = await this.preview.getPreview(component);
      // TODO: please fix file path concatenation here.
      const file = artifact.getFile(`public${req.params[1]}`);
      // TODO: 404 again how to handle.
      const contents = file ? file.contents : '';
      res.send(contents.toString());
    },
  ];
}
