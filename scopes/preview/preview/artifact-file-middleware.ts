import mime from 'mime';
import type { Request, Response } from '@teambit/express';
import { noPreview, serverError } from '@teambit/ui-foundation.ui.pages.static-error';
import type { Logger } from '@teambit/logger';
import type { PreviewArtifact } from './preview-artifact';

export type PreviewUrlParams = {
  /**
   * preview name like overview or composition
   */
  previewName?: string;
  /** `/preview/:filePath(*)` */
  filePath?: string;
};

export type GetCacheControlFunc = (filePath: string, contents: string, mimeType?: string | null) => string | undefined;

export function getArtifactFileMiddleware(logger: Logger, getCacheControlFunc?: GetCacheControlFunc) {
  return async (req: Request<PreviewUrlParams>, res: Response) => {
    try {
      // @ts-ignore
      const artifact: PreviewArtifact = req.artifact;
      // @ts-ignore
      const isLegacyPath = req.isLegacyPath;
      let file;
      if (!isLegacyPath) {
        file = getEnvTemplateFile(artifact, req.params.previewName, req.params.filePath);
      } else {
        file = getPreviewFile(artifact, req.params.previewName, req.params.filePath);
      }
      if (!file) return res.status(404).send(noPreview());

      const contents = file.contents;
      const str = `${file.cwd}/${file.path}`;
      const contentType = mime.getType(str);
      if (contentType) res.set('Content-Type', contentType);
      if (getCacheControlFunc) {
        const cacheControl = getCacheControlFunc(str, contents, contentType);
        if (cacheControl) {
          res.set('Cache-control', cacheControl);
        }
      }
      return res.send(contents);
    } catch (e: any) {
      logger.error('failed getting preview', e);
      return res.status(500).send(serverError());
    }
  };
}

function getEnvTemplateFile(artifact: PreviewArtifact, previewName?: string, filePath?: string) {
  const prevName = previewName || 'overview';
  const finalFilePath = filePath || `${prevName}.html`;
  const matchedFile = artifact?.getFileEndsWith(finalFilePath);
  return matchedFile;
}

function getPreviewFile(artifact: PreviewArtifact, previewName?: string, filePath?: string) {
  let finalFilePath = 'index.html';
  if (previewName || filePath) {
    const parts = [previewName, filePath].filter((x) => x);
    finalFilePath = parts.join('/');
  }
  const matchedFile = artifact?.getFileEndsWith(finalFilePath);
  return matchedFile;
}
