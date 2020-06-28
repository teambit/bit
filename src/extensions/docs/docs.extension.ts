import { BundlerExtension } from '../bundler';
import { Component } from '../component';

/**
 * the component documentation extension.
 */
export class DocsExtension {
  /**
   * returns an array of doc file paths for a set of components.
   */
  getDocFiles(components: Component[]): string[] {
    const componentDocs = components.map(component => {
      return component.state.filesystem.files.filter(file => file.path.includes('.docs.ts')).map(file => file.path);
    });

    return componentDocs.reduce((acc, current) => {
      acc = acc.concat(current);
      return acc;
    }, []);
  }

  static dependencies = [BundlerExtension];

  static async provider([bundler]: [BundlerExtension]) {
    const docs = new DocsExtension();

    bundler.registerTarget({
      entry: docs.getDocFiles.bind(docs)
    });

    return new DocsExtension();
  }
}
