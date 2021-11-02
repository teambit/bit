import { Request, Response, Route } from '@teambit/express';
import mime from 'mime';
import { join } from 'path';
import type { Component } from '@teambit/component';
import { serverError } from '@teambit/ui-foundation.ui.pages.static-error';
import type { Logger } from '@teambit/logger';

import { ElementsMain } from './elements.main.runtime';
import { ElementsArtifact } from './elements-artifact';

type UrlParams = {
  /** `/elements/:elementPath(*)` */
  elementsPath?: string;
};

export class ElementsRoute implements Route {
  constructor(
    /**
     * elements extension.
     */
    private elements: ElementsMain,
    private logger: Logger
  ) {}

  route = `/elements/:elementsPath(*)`;
  method = 'get';

  middlewares = [
    async (req: Request<UrlParams>, res: Response) => {
      try {
        // @ts-ignore TODO: @guy please fix.
        const component = req.component as Component | undefined;
        if (!component) return res.status(404).send();

        let artifact: ElementsArtifact | undefined;
        // TODO - prevent error `getVinylsAndImportIfMissing is not a function` #4680
        try {
          artifact = await this.elements.getElements(component);
        } catch (e: any) {
          return res.status(404).send();
        }
        // TODO: please fix file path concatenation here.
        const defaultRelativePath = 'asset-manifest.json';
        const relativePath = req.params.elementsPath || defaultRelativePath;
        const calculatedPath = join(this.elements.getElementsDirName(), 'public', relativePath);
        const file = artifact?.getFile(calculatedPath);
        if (!file) return res.status(404).send();

        const contents = file.contents;
        const str = `${file.cwd}/${file.path}`;
        const contentType = mime.getType(str);
        if (contentType) res.set('Content-Type', contentType);
        return res.send(contents);
      } catch (e: any) {
        this.logger.error('failed getting elements', e);
        return res.status(500).send(serverError());
      }
    },
  ];
}
