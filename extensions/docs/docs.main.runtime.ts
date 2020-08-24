import { MainRuntime } from '@teambit/cli';
import { Component, ComponentMap } from '@teambit/component';
import { ExecutionContext } from '@teambit/environments';
import { PreviewAspect, PreviewMain } from '@teambit/preview';
import { AbstractVinyl } from 'bit-bin/dist/consumer/component/sources';

import { DocsAspect } from './docs.aspect';
import { DocsPreviewDefinition } from './docs.preview-definition';

export type ComponentDocs = {
  files: string[];
  component: Component;
};

export type DocsConfig = {
  /**
   * regex for detection of documentation files
   */
  extension: string;
};

/**
 * the component documentation extension.
 */
export class DocsMain {
  constructor(
    /**
     * envs extension.
     */
    private preview: PreviewMain
  ) {}

  /**
   * returns an array of doc file paths for a set of components.
   */
  getDocsMap(components: Component[]): ComponentMap<AbstractVinyl[]> {
    return ComponentMap.as<AbstractVinyl[]>(components, (component) => {
      return component.state.filesystem.byRegex(/.docs.ts/);
    });
  }

  getDocsFiles(component: Component): AbstractVinyl[] {
    return component.state.filesystem.byRegex(/.docs.ts/);
  }

  // async docsPreviewTarget(context: ExecutionContext) {
  //   const docsMap = this.getDocsMap(context.components);
  //   const template = await this.getTemplate(context);

  //   const link = this.preview.writeLink(
  //     'overview',
  //     docsMap.filter((value) => value.length !== 0),
  //     template
  //   );

  //   const targetFiles = this.flattenMap(docsMap.flattenValue());
  //   return targetFiles.concat(link);
  // }

  // private flattenMap(docsMap: string[][]) {
  //   return docsMap.reduce((acc: string[], current) => {
  //     acc = acc.concat(current);
  //     return acc;
  //   }, []);
  // }

  async getTemplate(context: ExecutionContext) {
    return context.env.getDocsTemplate();
  }

  static runtime = MainRuntime;
  static dependencies = [PreviewAspect];

  static async provider([preview]: [PreviewMain]) {
    const docs = new DocsMain(preview);

    preview.registerDefinition(new DocsPreviewDefinition(docs));
    // bundler.registerTarget({
    //   entry: docs.docsPreviewTarget.bind(docs),
    // });

    return docs;
  }
}

DocsAspect.addRuntime(DocsMain);
