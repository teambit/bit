import { MainRuntime } from '@teambit/cli';
import { AspectData, Component, ComponentMap, IComponent } from '@teambit/component';
import { DevFilesAspect, DevFilesMain } from '@teambit/dev-files';
import EnvsAspect, { EnvsMain } from '@teambit/envs';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { ComponentLoadOptions } from '@teambit/legacy/dist/consumer/component/component-loader';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { PreviewAspect, PreviewMain } from '@teambit/preview';
import { SchemaAspect, SchemaMain } from '@teambit/schema';
import { matchPatterns, splitPatterns } from '@teambit/toolbox.path.match-patterns';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { join } from 'path';
import { Composition } from './composition';
import { CompositionsAspect } from './compositions.aspect';
import { compositionsSchema } from './compositions.graphql';
import { CompositionPreviewDefinition } from './compositions.preview-definition';

export type CompositionsConfig = {
  /**
   * glob pattern to detect composition files. This includes all related files, like styles and jsons.
   * @example ['/*.composition?(s).*']
   */
  compositionFilePattern: string[];
  /**
   * glob pattern to select Preview files. this will only include files matched by compositionFilePattern.
   * @example ['*.{t,j}s', '*.{t,j}sx']
   */
  compositionPreviewFilePattern: string[];
};

/**
 * the component documentation extension.
 */
export class CompositionsMain {
  constructor(
    /**
     * Glob pattern to select all composition files
     */
    private compositionFilePattern: string[],

    /**
     * Glob pattern to select composition preview files
     */
    private previewFilePattern: string[],

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
    private schema: SchemaMain,

    private devFiles: DevFilesMain,

    private envs: EnvsMain
  ) {}

  /**
   * returns an array of doc file paths for a set of components.
   */
  getPreviewFiles(components: Component[]): ComponentMap<AbstractVinyl[]> {
    return ComponentMap.as<AbstractVinyl[]>(components, (component) => {
      // this includes non executables, like `button.compositions.module.scss` or `presets.compositions.json`
      const compositionFiles = component.state.filesystem.byGlob(this.compositionFilePattern);

      // select only relevant preview files (.tsx, etc)
      const previewFiles = new Set(
        component.state.filesystem.byGlob(this.previewFilePattern).map((file) => file.relative)
      );
      const files = compositionFiles.filter((file) => previewFiles.has(file.relative));

      return files;
    });
  }

  /**
   * checks if a file matches the composition file pattern.
   */
  isCompositionFile(filePath: string): boolean {
    const { includePatterns, excludePatterns } = splitPatterns(this.compositionFilePattern);
    return matchPatterns(filePath, includePatterns, excludePatterns);
  }

  /**
   * get component compositions.
   */
  getCompositions(component: IComponent): Composition[] {
    const entry = component.get(CompositionsAspect.id);
    if (!entry) return [];
    const compositions = entry.data.compositions;
    if (!compositions) return [];

    return Composition.fromArray(compositions);
  }

  /**
   * read composition from the component source code.
   */
  readCompositions(component: Component): Composition[] {
    const maybeFiles = this.getPreviewFiles([component]).byComponent(component);

    if (!maybeFiles) return [];
    const [, files] = maybeFiles;
    return files.map((file) => this.computeCompositions(component, file)).flat();
  }

  getCompositionFilePattern() {
    return this.compositionFilePattern;
  }

  getComponentDevPatterns(component: Component) {
    const env = this.envs.calculateEnv(component, { skipWarnings: !!this.workspace.inInstallContext }).env;
    const componentEnvCompositionsDevPatterns: string[] = env.getCompositionsDevPatterns
      ? env.getCompositionsDevPatterns(component)
      : [];
    const componentPatterns = componentEnvCompositionsDevPatterns.concat(this.getCompositionFilePattern());
    return { name: 'compositions', pattern: componentPatterns };
  }

  getDevPatternToRegister() {
    return this.getComponentDevPatterns.bind(this);
  }

  async onComponentLoad(component: Component, loadOpts?: ComponentLoadOptions): Promise<AspectData | undefined> {
    if (loadOpts?.loadCompositions === false) return undefined;
    const compositions = this.readCompositions(component);
    return {
      compositions: compositions.map((composition) => composition.toObject()),
    };
  }

  private computeCompositions(component: Component, file: AbstractVinyl): Composition[] {
    // :TODO hacked for a specific file extension now until david will take care in the compiler.
    const pathArray = file.path.split('.');
    pathArray[pathArray.length - 1] = 'js';

    const exports = this.schema.parseModule(join(this.workspace.componentDir(component.id), file.relative));
    return exports.map((exportModel) => {
      const displayName = exportModel.staticProperties?.get('compositionName');

      return new Composition(
        exportModel.identifier,
        file.relative,
        typeof displayName === 'string' ? displayName : undefined
      );
    });
  }

  static defaultConfig: CompositionsConfig = {
    compositionFilePattern: ['**/*.composition?(s).*'],
    compositionPreviewFilePattern: ['**/*.{t,j}s?(x)'],
  };

  static runtime = MainRuntime;
  static dependencies = [PreviewAspect, GraphqlAspect, WorkspaceAspect, SchemaAspect, DevFilesAspect, EnvsAspect];

  static async provider(
    [preview, graphql, workspace, schema, devFiles, envs]: [
      PreviewMain,
      GraphqlMain,
      Workspace,
      SchemaMain,
      DevFilesMain,
      EnvsMain
    ],
    config: CompositionsConfig
  ) {
    const compositions = new CompositionsMain(
      config.compositionFilePattern,
      config.compositionPreviewFilePattern,
      preview,
      workspace,
      schema,
      devFiles,
      envs
    );

    // TODO: use the docs implementation to allow component specific pattern
    devFiles.registerDevPattern(compositions.getDevPatternToRegister());

    graphql.register(compositionsSchema(compositions));
    preview.registerDefinition(new CompositionPreviewDefinition(compositions));

    if (workspace) {
      workspace.onComponentLoad(compositions.onComponentLoad.bind(compositions));
    }

    return compositions;
  }
}

CompositionsAspect.addRuntime(CompositionsMain);
