import { Request, Response, Route } from '@teambit/express';
import mime from 'mime';
import type { Component } from '@teambit/component';
import { stringifiedPreviewNotFoundPage } from '@teambit/ui-foundation.ui.pages.preview-not-found';

import { PreviewMain } from './preview.main.runtime';
import { PreviewArtifact } from './preview-artifact';

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
      const component = req.component as Component | undefined;
      if (!component) {
        return res.status(404).send(stringifiedPreviewNotFoundPage());
      }

      let artifact: PreviewArtifact | undefined;
      // TODO - prevent error `getVinylsAndImportIfMissing is not a function`
      try {
        artifact = await this.preview.getPreview(component);
      } catch (e) {
        return res.status(404).send(stringifiedPreviewNotFoundPage());
      }
      // TODO: please fix file path concatenation here.
      const file = artifact?.getFile(`public/${req.params.previewPath || 'index.html'}`);
      if (!file) return res.status(404).send(stringifiedPreviewNotFoundPage());

      const contents = file.contents;
      const str = `${file.cwd}/${file.path}`;
      const contentType = mime.getType(str);
      if (contentType) res.set('Content-Type', contentType);
      return res.send(contents);
    },
  ];
}
