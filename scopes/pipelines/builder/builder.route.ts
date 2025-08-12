import type { Request, Response, Route } from '@teambit/express';
import type { Component } from '@teambit/component';
import archiver from 'archiver';
import type { Logger } from '@teambit/logger';
import type { ScopeMain } from '@teambit/scope';
import mime from 'mime';
import type { BuilderMain } from './builder.main.runtime';

export const routePath = `builder`;

export type BuilderUrlParams = {
  aspectId?: string;
  filePath?: string;
};
export const defaultExtension = '.tgz';
export class BuilderRoute implements Route {
  constructor(
    private builder: BuilderMain,
    private scope: ScopeMain,
    private logger: Logger
  ) {}
  route = `/${routePath}/*`;
  method = 'get';

  middlewares = [
    async (req: Request<BuilderUrlParams>, res: Response) => {
      // @ts-ignore TODO: @guy please fix.
      const component = req.component as Component;
      const { params } = req;
      const [aspectIdStr, filePath] = params[1].split('~');
      // remove trailing slash
      const aspectId = aspectIdStr.replace(/\/$/, '');
      const artifacts = aspectId
        ? this.builder.getArtifactsByAspect(component, aspectId)
        : this.builder.getArtifacts(component);
      if (!artifacts)
        return res
          .status(404)
          .jsonp({ error: `no artifacts found for component ${component.id} by aspect ${aspectId}` });
      const extensionsWithArtifacts = await Promise.all(
        artifacts.map(async (artifact) => {
          const files = await artifact.files.getVinylsAndImportIfMissing(component.id, this.scope.legacyScope);
          if (!filePath) return { extensionId: artifact.task.aspectId, files };
          return { extensionId: artifact.task.aspectId, files: files.filter((file) => file.path === filePath) };
        })
      );

      const artifactFilesCount = extensionsWithArtifacts.reduce((accum, next) => accum + next.files.length, 0);

      if (artifactFilesCount === 0)
        return res
          .status(404)
          .jsonp({ error: `no artifacts found for component ${component.id} by aspect ${aspectId}` });

      if (artifactFilesCount === 1) {
        const extensionWithArtifact = extensionsWithArtifacts.find((e) => e.files.length > 0);
        const fileName = `${extensionWithArtifact?.extensionId}_${extensionWithArtifact?.files[0].path}`;
        const fileContent = extensionWithArtifact?.files[0].contents;
        const fileExt = extensionWithArtifact?.files[0].extname || defaultExtension;
        const contentType = mime.getType(fileExt);
        res.set('Content-disposition', `attachment; filename=${fileName}`);
        if (contentType) res.set('Content-Type', contentType);
        return res.send(fileContent);
      }

      /**
       * if more than 1 file requested, zip them before sending
       */
      const archive = archiver('tar', { gzip: true });

      archive.on('warning', (warn) => {
        this.logger.warn(warn.message);
      });

      archive.on('error', (err) => {
        this.logger.error(err.message);
      });

      extensionsWithArtifacts.forEach((extensionWithArtifacts) => {
        extensionWithArtifacts.files.forEach((artifact) => {
          archive.append(artifact.contents, { name: `${extensionWithArtifacts.extensionId}_${artifact.path}` });
        });
      });

      try {
        archive.pipe(res);
        /**
         *  promise that is returned from the await zip.finalize(); is resolved before the archive is actually finalized
         *  resolving it results in setting the headers before the stream is finished
         */
        // eslint-disable-next-line no-void
        void archive.finalize();
        return res.attachment(`${aspectId.replace('/', '_')}.tar`);
      } catch (e: any) {
        return res.send({ error: e.toString() });
      }
    },
  ];
}
