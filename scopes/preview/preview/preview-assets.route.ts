import type { Request, Response, Route } from '@teambit/express';
import type { Component } from '@teambit/component';
import { serverError } from '@teambit/ui-foundation.ui.pages.static-error';
import type { Logger } from '@teambit/logger';

import type { PreviewMain } from './preview.main.runtime';

export class PreviewAssetsRoute implements Route {
  constructor(
    /**
     * preview extension.
     */
    private preview: PreviewMain,
    private logger: Logger
  ) {}

  route = '/preview-assets';
  method = 'get';

  middlewares = [
    async (req: Request, res: Response) => {
      try {
        // @ts-ignore TODO: @guy please fix.
        const component = req.component as Component | undefined;
        // if (!component) return res.status(404).send(noPreview());
        if (!component) return res.status(404).jsonp({ error: 'not found' });
        const result = await this.preview.getPreviewFiles(component);
        if (!result) return res.status(404).jsonp({ error: 'not found' });
        return res.json(result);
      } catch (e: any) {
        this.logger.error('failed getting preview assets', e);
        return res.status(500).send(serverError());
      }
    },
  ];
}
