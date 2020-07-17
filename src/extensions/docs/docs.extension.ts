import { BundlerExtension } from '../bundler';
import { Component } from '../component';
import { ExecutionContext } from '../environments';
import { ComponentMap } from '../component/component-map';
import { PreviewExtension } from '../preview/preview.extension';

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
export class DocsExtension {
  constructor(
    /**
     * envs extension.
     */
    private preview: PreviewExtension
  ) {}

  /**
   * returns an array of doc file paths for a set of components.
   */
  getDocsMap(components: Component[]): ComponentMap<string[]> {
    return ComponentMap.as<string[]>(components, (component) => {
      const files = component.state.filesystem.byRegex(/docs.ts/);
      return files.map((file) => file.path);
    });
  }

  async docsPreviewTarget(context: ExecutionContext) {
    const docsMap = this.getDocsMap(context.components);
    const template = await this.getTemplate(context);

    const link = this.preview.writeLink(
      'overview',
      docsMap.filter((value) => value.length !== 0),
      template
    );

    const targetFiles = this.flattenMap(docsMap.flattenValue());
    return targetFiles.concat(link);
  }

  private flattenMap(docsMap: string[][]) {
    return docsMap.reduce((acc: string[], current) => {
      acc = acc.concat(current);
      return acc;
    }, []);
  }

  private async getTemplate(context: ExecutionContext) {
    return context.env.getDocsTemplate();
  }

  static dependencies = [BundlerExtension, PreviewExtension];

  static async provider([bundler, preview]: [BundlerExtension, PreviewExtension]) {
    const docs = new DocsExtension(preview);

    bundler.registerTarget({
      entry: docs.docsPreviewTarget.bind(docs),
    });

    return docs;
  }
}
