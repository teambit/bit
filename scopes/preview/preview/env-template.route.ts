import type { NextFunction, Request, Response } from '@teambit/express';
import type { ComponentUrlParams, RegisteredComponentRoute } from '@teambit/component';
import { noPreview, serverError } from '@teambit/ui-foundation.ui.pages.static-error';
import type { Logger } from '@teambit/logger';

import type { PreviewMain } from './preview.main.runtime';
import type { PreviewArtifact } from './preview-artifact';
import { getArtifactFileMiddleware, GetCacheControlFunc } from './artifact-file-middleware';

type UrlParams = ComponentUrlParams & {
  filePath?: string;
};

// Week for now
const CACHE_MAX_AGE = 60 * 60 * 24 * 7;

const getCacheControl: GetCacheControlFunc = (_filePath: string, _contents: string, mimeType?: string | null) => {
  // Do not cache the html files
  if (mimeType && mimeType === 'text/html') {
    return undefined;
  }
  return `private, max-age=${CACHE_MAX_AGE}`;
};

export class EnvTemplateRoute implements RegisteredComponentRoute {
  constructor(
    /**
     * preview extension.
     */
    private preview: PreviewMain,
    private logger: Logger
  ) {}

  route = `/env-template/:previewName/:filePath(*)`;
  method = 'get';

  // Since we might give it a core env id
  // Then in the component route when we do host.get(id) it will fail, as we don't have the core envs in the scope/workspace
  resolveComponent = false;

  // @ts-ignore
  middlewares = [
    async (req: Request<UrlParams>, res: Response, next: NextFunction) => {
      try {
        // @ts-ignore TODO: @guy please fix.
        // const component = req.component as Component | undefined;
        // if (!component) return res.status(404).send(noPreview());

        let artifact: PreviewArtifact | undefined;
        // TODO - prevent error `getVinylsAndImportIfMissing is not a function` #4680
        try {
          const { componentId: envId } = req.params;
          artifact = await this.preview.getEnvTemplateByEnvId(envId);
        } catch (e: any) {
          this.logger.error(`getEnvTemplateByEnvId has failed`, e);
          return res.status(404).send(noPreview());
        }

        // @ts-ignore
        req.artifact = artifact;
        // @ts-ignore
        req.isLegacyPath = false;

        return next();
      } catch (e: any) {
        this.logger.error('failed getting preview', e);
        return res.status(500).send(serverError());
      }
    },
    getArtifactFileMiddleware(this.logger, getCacheControl),
  ];
}
