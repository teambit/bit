import mime from 'mime';
import { Request, Response } from '@teambit/express';
import { noPreview, serverError } from '@teambit/ui-foundation.ui.pages.static-error';
import type { Logger } from '@teambit/logger';
import { PreviewArtifact } from './preview-artifact';

export type PreviewUrlParams = {
  /**
   * preview name like overview or composition
   */
  previewName?: string;
  /** `/preview/:previewPath(*)` */
  previewPath?: string;
};

export function getArtifactFileMiddleware(logger: Logger) {
  return async (req: Request<PreviewUrlParams>, res: Response) => {
    try {
      // @ts-ignore
      const artifact: PreviewArtifact = req.artifact;
      // @ts-ignore
      const isLegacyPath = req.isLegacyPath;
      let file;
      if (!isLegacyPath) {
        file = getEnvTemplateFile(artifact, req.params.previewName, req.params.previewPath);
      } else {
        file = getPreviewFile(artifact, req.params.previewName, req.params.previewPath);
      }
      if (!file) return res.status(404).send(noPreview());

      const contents = file.contents;
      const str = `${file.cwd}/${file.path}`;
      const contentType = mime.getType(str);
      if (contentType) res.set('Content-Type', contentType);
      return res.send(contents);
    } catch (e: any) {
      logger.error('failed getting preview', e);
      return res.status(500).send(serverError());
    }
  };
}

function getEnvTemplateFile(artifact: PreviewArtifact, previewName?: string, previewPath?: string) {
  const prevName = previewName || 'overview';
  const filePath = previewPath || `${prevName}.html`;
  const matchedFile = artifact?.getFileEndsWith(filePath);
  return matchedFile;
}

function getPreviewFile(artifact: PreviewArtifact, previewName?: string, previewPath?: string) {
  let filePath = 'index.html';
  if (previewName || previewPath) {
    const parts = [previewName, previewPath].filter((x) => x);
    filePath = parts.join('/');
  }
  const matchedFile = artifact?.getFileEndsWith(filePath);
  return matchedFile;
}
