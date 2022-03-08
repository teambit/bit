import type { NextFunction, Request, Response, Route } from '@teambit/express';
import type { Component } from '@teambit/component';
import { noPreview, serverError } from '@teambit/ui-foundation.ui.pages.static-error';
import type { Logger } from '@teambit/logger';

import { PreviewMain } from './preview.main.runtime';
import { PreviewArtifact } from './preview-artifact';
import { getArtifactFileMiddleware } from './artifact-file-middleware';
import type { PreviewUrlParams } from './artifact-file-middleware';

export class PreviewRoute implements Route {
  constructor(
    /**
     * preview extension.
     */
    private preview: PreviewMain,
    private logger: Logger
  ) {}

  route = `/preview/:previewName?/:filePath(*)`;
  method = 'get';

  middlewares = [
    async (req: Request<PreviewUrlParams>, res: Response, next: NextFunction) => {
      try {
        // @ts-ignore TODO: @guy please fix.
        const component = req.component as Component | undefined;
        if (!component) return res.status(404).send(noPreview());
        const isLegacyPath = await this.preview.isBundledWithEnv(component);

        let artifact: PreviewArtifact | undefined;
        // TODO - prevent error `getVinylsAndImportIfMissing is not a function` #4680
        try {
          // Taking the env template (in this case we will take the component only bundle throw component-preview route)
          // We use this route for the env template for backward compatibility - new scopes which contain components tagged with old versions of bit
          if (!isLegacyPath) {
            artifact = await this.preview.getEnvTemplateFromComponentEnv(component);
          } else {
            // If it's legacy (bundled together with the env template) take the preview bundle from the component directly
            artifact = await this.preview.getPreview(component);
          }
        } catch (e: any) {
          this.logger.error(`getEnvTemplateFromComponentEnv or getPreview has failed`, e);
          return res.status(404).send(noPreview());
        }
        // @ts-ignore
        req.artifact = artifact;
        // @ts-ignore
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
