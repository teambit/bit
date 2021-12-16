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

  route = `/${this.elements.baseRoute}:elementsPath(*)`;
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
        let file;
        if (req.params.elementsPath) {
          const relativePath = req.params.elementsPath;
          const calculatedPath = join(this.elements.getElementsDirName(), 'public', relativePath);
          file = artifact?.getFile(calculatedPath);
        } else {
          file = artifact?.getMainElementsBundleFile();
        }
        if (!file) return res.status(404).send();

        const contents = file.contents;
        const str = `${file.cwd}/${file.path}`;
        // @ts-ignore - temporarily, remove it later
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
