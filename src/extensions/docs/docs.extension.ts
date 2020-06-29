import { writeFileSync } from 'fs';
import { resolve, join } from 'path';
import { BundlerExtension } from '../bundler';
import { Component } from '../component';
import { generateLink } from './generate-link';
import { Environments, ExecutionContext } from '../environments';
import { DocsService } from './docs.service';

export type ComponentDocs = {
  files: string[];
  component: Component;
};

/**
 * the component documentation extension.
 */
export class DocsExtension {
  constructor(
    /**
     * envs extension.
     */
    private envs: Environments,

    /**
     * environment service for docs.
     */
    private docsService: DocsService
  ) {}

  /**
   * returns an array of doc file paths for a set of components.
   */
  getDocFiles(components: Component[]): string[] {
    const docsMap = this.getDocsMap(components);
    return docsMap.reduce((acc: string[], current) => {
      acc = acc.concat(current.files);
      return acc;
    }, []);
  }

  getDocsMap(components: Component[]): ComponentDocs[] {
    const docsMap = components.map(component => {
      return {
        files: component.state.filesystem.files.filter(file => file.path.includes('.docs.ts')).map(file => file.path),
        component
      };
    });

    return docsMap;
  }

  async generateLink(context: ExecutionContext) {
    const docsMap = this.getDocsMap(context.components);
    const template = await this.getTemplate(context);

    const link = this.writePreviewLink(
      docsMap.filter(componentDocs => componentDocs.files.length !== 0),
      template
    );

    return this.flattenMap(docsMap).concat(link);
  }

  private flattenMap(docsMap: ComponentDocs[]) {
    return docsMap.reduce((acc: string[], current) => {
      acc = acc.concat(current.files);
      return acc;
    }, []);
  }

  private async getTemplate(context: ExecutionContext) {
    return context.env.getDocsTemplate();
  }

  private writePreviewLink(componentDocs: ComponentDocs[], templatePath: string): string {
    const contents = generateLink(componentDocs, templatePath);
    // :TODO @uri please generate a random file in a temporary directory
    const targetPath = resolve(join(__dirname, '/__docs.js'));
    writeFileSync(targetPath, contents);

    return targetPath;
  }

  static dependencies = [BundlerExtension, Environments];

  static async provider([bundler, envs]: [BundlerExtension, Environments]) {
    const docs = new DocsExtension(envs, new DocsService());

    bundler.registerTarget({
      entry: docs.generateLink.bind(docs)
    });

    return docs;
  }
}
