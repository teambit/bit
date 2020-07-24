import { Route, Request, Response } from '../express';
import { PreviewExtension } from './preview.extension';

export class PreviewRoute implements Route {
  constructor(
    /**
     * preview extension.
     */
    private preview: PreviewExtension
  ) {}

  route = '/';
  method = 'get';
  middlewares = [
    async (req: Request, res: Response) => {
      res.send('hi there');
    },
  ];
}
