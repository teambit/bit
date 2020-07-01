/* eslint-disable import/no-dynamic-require */
import { BundlerExtension } from '../bundler';
import { Component, ComponentFactoryExt } from '../component';
import { ExecutionContext } from '../environments';
import { ComponentMap } from '../component/component-map';
import { PreviewExtension } from '../preview/preview.extension';
import { Composition } from './composition';
import { compositionsSchema } from './compositions.graphql';
import { GraphQLExtension } from '../graphql';

export type CompositionsConfig = {
  /**
   * regex for detection of documentation files
   */
  extension: string;
};

/**
 * the component documentation extension.
 */
export class CompositionsExtension {
  constructor(
    /**
     * envs extension.
     */
    private preview: PreviewExtension
  ) {}

  /**
   * returns an array of doc file paths for a set of components.
   */
  getCompositionFiles(components: Component[]): ComponentMap<string[]> {
    return ComponentMap.as<string[]>(components, component => {
      const files = component.state.filesystem.byRegex(/composition.ts/);
      return files.map(file => file.path);
    });
  }

  getCompositions(component: Component) {
    const maybeFiles = this.getCompositionFiles([component]).byComponent(component);
    if (!maybeFiles) return [];
    const [, files] = maybeFiles;

    return files.map(file => {
      return {
        [file]: this.computeCompositions(file)
      };
    });
  }

  async compositionsPreviewTarget(context: ExecutionContext) {
    const compositionsMap = this.getCompositionFiles(context.components);
    const template = await this.getTemplate(context);

    const link = this.preview.writeLink(
      'compositions',
      compositionsMap.filter(value => value.length !== 0),
      template
    );

    const targetFiles = this.flattenMap(compositionsMap.flattenValue());
    return targetFiles.concat(link);
  }

  private computeCompositions(modulePath: string) {
    // eslint-disable-next-line global-require
    const module = require(modulePath);
    return Object.keys(module).map(identifier => {
      return new Composition(identifier, modulePath);
    });
  }

  private flattenMap(compositionsMap: string[][]) {
    return compositionsMap.reduce((acc: string[], current) => {
      acc = acc.concat(current);
      return acc;
    }, []);
  }

  private async getTemplate(context: ExecutionContext) {
    return context.env.getMounter();
  }

  static dependencies = [BundlerExtension, PreviewExtension, GraphQLExtension, ComponentFactoryExt];

  static async provider([bundler, preview, graphql]: [BundlerExtension, PreviewExtension, GraphQLExtension]) {
    const compositions = new CompositionsExtension(preview);

    graphql.register(compositionsSchema(compositions));
    bundler.registerTarget({
      entry: compositions.compositionsPreviewTarget.bind(compositions)
    });

    return compositions;
  }
}
