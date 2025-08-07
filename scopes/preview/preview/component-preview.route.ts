import type { NextFunction, Request, Response, Route } from '@teambit/express';
import type { Component } from '@teambit/component';
import { noPreview, serverError } from '@teambit/ui-foundation.ui.pages.static-error';
import type { Logger } from '@teambit/logger';

import type { PreviewMain } from './preview.main.runtime';
import type { PreviewArtifact } from './preview-artifact';
import type { PreviewUrlParams } from './artifact-file-middleware';
import { getArtifactFileMiddleware } from './artifact-file-middleware';

export class ComponentPreviewRoute implements Route {
  constructor(
    /**
     * preview extension.
     */
    private preview: PreviewMain,
    private logger: Logger
  ) {}

  route = `/component-preview/:filePath(*)`;
  method = 'get';

  middlewares = [
    async (req: Request<PreviewUrlParams>, res: Response, next: NextFunction) => {
      try {
        let isLegacyPath = false;
        // @ts-expect-error TODO: @guy please fix.
        const component = req.component as Component | undefined;
        if (!component) return res.status(404).send(noPreview());

        let artifact: PreviewArtifact | undefined;
        // TODO - prevent error `getVinylsAndImportIfMissing is not a function` #4680
        try {
          isLegacyPath = true;
          artifact = await this.preview.getPreview(component);
        } catch (e: any) {
          this.logger.error(`preview.getPreview has failed`, e);
          return res.status(404).send(noPreview());
        }
        // @ts-expect-error
        req.artifact = artifact;
        // @ts-expect-error
        req.isLegacyPath = isLegacyPath;
        return next();
      } catch (e: any) {
        this.logger.error('failed getting preview', e);
        return res.status(500).send(serverError());
      }
    },
    getArtifactFileMiddleware(this.logger),
  ];
}
