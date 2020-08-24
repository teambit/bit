import { MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect, ComponentMap } from '@teambit/component';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { PreviewAspect, PreviewMain } from '@teambit/preview';
import { SchemaAspect, SchemaMain } from '@teambit/schema';
import { ExtensionData, Workspace, WorkspaceAspect } from '@teambit/workspace';
import { AbstractVinyl } from 'bit-bin/dist/consumer/component/sources';
import { flatten } from 'bit-bin/dist/utils';

import { Composition } from './composition';
import { CompositionsAspect } from './compositions.aspect';
import { compositionsSchema } from './compositions.graphql';
import { CompositionPreviewDefinition } from './compositions.preview-definition';

export type CompositionsConfig = {
  /**
   * regex for detection of composition files
   */
  regex: string;
};

/**
 * the component documentation extension.
 */
export class CompositionsMain {
  constructor(
    /**
     * envs extension.
     */
    private preview: PreviewMain,

    /**
     * workspace extension.
     */
    private workspace: Workspace,

    /**
     * schema extension.
     */
    private schema: SchemaMain
  ) {}

  /**
   * returns an array of doc file paths for a set of components.
   */
  getCompositionFiles(components: Component[]): ComponentMap<AbstractVinyl[]> {
    return ComponentMap.as<AbstractVinyl[]>(components, (component) => {
      return component.state.filesystem.byRegex(/.composition.ts/);
    });
  }

  /**
   * get component compositions.
   */
  getCompositions(component: Component): Composition[] {
    const entry = component.state.config.extensions.findExtension(CompositionsAspect.id);
    if (!entry) return [];
    const compositions = entry.data.compositions;
    if (!compositions) return [];

    return Composition.fromArray(compositions);
  }

  /**
   * read composition from the component source code.
   */
  readCompositions(component: Component): Composition[] {
    const maybeFiles = this.getCompositionFiles([component]).byComponent(component);
    if (!maybeFiles) return [];
    const [, files] = maybeFiles;

    return flatten(
      files.map((file) => {
        return this.computeCompositions(component, file);
      })
    );
  }

  async onComponentLoad(component: Component): Promise<ExtensionData> {
    const compositions = this.readCompositions(component);
    return {
      compositions: compositions.map((composition) => composition.toObject()),
    };
  }

  private computeCompositions(component: Component, file: AbstractVinyl): Composition[] {
    // :TODO hacked for a specific file extension now until david will take care in the compiler.
    const pathArray = file.path.split('.');
    pathArray[pathArray.length - 1] = 'js';

    const module = this.schema.parseModule(file.path);
    return module.exports.map((exportModel) => {
      return new Composition(exportModel.identifier, file.relative);
    });
  }

  static defaultConfig = {
    regex: '/compositions.ts/',
  };

  static runtime = MainRuntime;
  static dependencies = [PreviewAspect, GraphqlAspect, WorkspaceAspect, SchemaAspect, ComponentAspect];

  static async provider([preview, graphql, workspace, schema]: [PreviewMain, GraphqlMain, Workspace, SchemaMain]) {
    const compositions = new CompositionsMain(preview, workspace, schema);

    graphql.register(compositionsSchema(compositions));
    preview.registerDefinition(new CompositionPreviewDefinition(compositions));

    if (workspace) {
      workspace.onComponentLoad(compositions.onComponentLoad.bind(compositions));
    }

    return compositions;
  }
}

CompositionsAspect.addRuntime(CompositionsMain);
