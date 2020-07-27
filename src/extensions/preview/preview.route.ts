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
  route = 'preview/*';
  method = 'get';

  async middleware(req: Request, res: Response) {
    const component = req.component;
    const artifact = this.preview.getPreview(component);
    const file = artifact.getFile(req.params);
    res.send(file);
  }
}
