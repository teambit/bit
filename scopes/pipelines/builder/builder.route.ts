import { Request, Response, Route } from '@teambit/express';
import { Component } from '@teambit/component';
// import archiver from 'archiver';
import mime from 'mime';
import { Scope } from '@teambit/legacy/dist/scope';
import { BuilderMain } from './builder.main.runtime';

export const routePath = `builder`;

export type BuilderUrlParams = {
  aspectId?: string;
  filePath?: string;
};
export const defaultExtension = '.tgz';
export class BuilderRoute implements Route {
  constructor(private builder: BuilderMain, private scope: Scope) {}
  route = `/${routePath}/:aspectId(*)/~:filePath(*)`;
  method = 'get';

  middlewares = [
    async (req: Request<BuilderUrlParams>, res: Response) => {
      // @ts-ignore TODO: @guy please fix.
      const component = req.component as Component;
      const { aspectId, filePath } = req.params;
      const artifacts = aspectId
        ? this.builder.getArtifactsByExtension(component, aspectId)
        : this.builder.getArtifacts(component);
      if (!artifacts) return res.status(404).jsonp({ error: 'not found' });
      const extensionsWithArtifacts = await Promise.all(
        artifacts.map(async (artifact) => {
          const files = await artifact.files.getVinylsAndImportIfMissing(component.id._legacy, this.scope);
          if (!filePath) return { extensionId: artifact.task.id, files };
          return { extensionId: artifact.task.id, files: files.filter((file) => file.path === filePath) };
        })
      );
      const artifactFilesCount = extensionsWithArtifacts.reduce((accum, next) => accum + next.files.length, 0);
      if (artifactFilesCount === 0) return res.status(404).jsonp({ error: 'not found' });

      if (artifactFilesCount === 1) {
        const extensionWithArtifact = extensionsWithArtifacts.find((e) => e.files.length > 0);
        const fileName = `${extensionWithArtifact?.extensionId}/${extensionWithArtifact?.files[0].path}`;
        const fileContent = extensionWithArtifact?.files[0].contents;
        const fileExt = extensionWithArtifact?.files[0].extname || defaultExtension;
        const contentType = mime.getType(fileExt);
        res.set('Content-disposition', `attachment; filename=${fileName}`);
        if (contentType) res.set('Content-Type', contentType);
        return res.send(fileContent);
      }

      // ZIP all files if requesting more than 1
      console.log(req.params, component);
      return res.send();
    },
  ];
}
