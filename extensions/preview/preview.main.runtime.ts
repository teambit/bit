import { writeFileSync } from 'fs-extra';
import { join, resolve } from 'path';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { BundlerAspect, BundlerMain } from '@teambit/bundler';
import { MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect, ComponentMain, ComponentMap } from '@teambit/component';
import { EnvsAspect, EnvsMain, ExecutionContext } from '@teambit/environments';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { UIAspect, UiMain } from '@teambit/ui';
import { flatten } from 'lodash';
import { PreviewArtifactNotFound } from './exceptions';
import { generateLink } from './generate-link';
import { PreviewArtifact } from './preview-artifact';
import { PreviewDefinition } from './preview-definition';
import { PreviewAspect, PreviewRuntime } from './preview.aspect';
import { PreviewRoute } from './preview.route';
import { PreviewTask } from './preview.task';

export type PreviewDefinitionRegistry = SlotRegistry<PreviewDefinition>;

export class PreviewMain {
  constructor(
    /**
     * slot for preview definitions.
     */
    private previewSlot: PreviewDefinitionRegistry,

    private ui: UiMain,

    private envs: EnvsMain
  ) {}

  async getPreview(component: Component): Promise<PreviewArtifact> {
    const entry = component.config.extensions.findCoreExtension(PreviewAspect.id);
    if (!entry) throw new PreviewArtifactNotFound(component.id);
    const artifacts = entry.artifacts;
    if (!artifacts) throw new PreviewArtifactNotFound(component.id);

    // @ts-ignore TODO: remove after @david fixes issue with artifacts type.
    return new PreviewArtifact(artifacts);
  }

  getDefs() {
    return this.previewSlot.values();
  }

  /**
   * write a link for a loading custom modules dynamically.
   * @param prefix write
   * @param moduleMap map of components to module paths to require.
   * @param defaultModule
   */
  writeLink(prefix: string, moduleMap: ComponentMap<string[]>, defaultModule?: string, dirName?: string) {
    const contents = generateLink(prefix, moduleMap, defaultModule);
    // :TODO @uri please generate a random file in a temporary directory
    const targetPath = resolve(join(dirName || __dirname, `/__${prefix}-${Date.now()}.js`));
    writeFileSync(targetPath, contents);

    return targetPath;
  }

  async getPreviewTarget(context: ExecutionContext): Promise<string[]> {
    const previews = this.previewSlot.values();
    const previewRuntime = await this.writePreviewRuntime();

    const paths = previews.map(async (previewDef) => {
      const map = await previewDef.getModuleMap(context.components);

      const withPaths = map.map<string[]>((files) => {
        return files.map((file) => file.path);
      });

      const link = this.writeLink(
        previewDef.prefix,
        withPaths,
        previewDef.renderTemplatePath ? await previewDef.renderTemplatePath(context) : undefined
      );

      const outputFiles = flatten(
        map.toArray().map(([, files]) => {
          return files.map((file) => file.path);
        })
      ).concat([link]);

      return outputFiles;
    });

    const resolved = await Promise.all(paths);
    return resolved.flatMap((array) => array).concat([previewRuntime]);
  }

  async writePreviewRuntime() {
    const [name, uiRoot] = this.ui.getUi();
    const filePath = await this.ui.generateRoot(
      await uiRoot.resolveAspects(PreviewRuntime.name),
      name,
      'preview',
      PreviewAspect.id
    );
    return filePath;
  }

  // /** writes a series of link files that will load the component previews */
  // async writeLinks(
  //   /** previews data structure to serialize and write down */
  //   previews: { name: string; modulePaths: ComponentMap<string[]>; templatePath?: string }[],
  //   /** folder to write links at. (Default - os.temp) */
  //   dir: string = makeTempDir()
  // ) {
  //   const linkFiles = previews.map(({ name, modulePaths, templatePath }) =>
  //     this.writePreviewLink(dir, name, modulePaths, templatePath)
  //   );

  //   const indexFilePath = this.writeIndexFile(linkFiles, dir);
  //   const updaterPath = this.writeUpdater(dir, indexFilePath, previewRuntime);

  //   return updaterPath;
  // }

  // /** generates a index file that links to all of the preview files  */
  // private writeIndexFile(linkFiles: [string, string][], dir: string) {
  //   const indexFile = makeReExport(linkFiles);
  //   const indexFilePath = resolve(join(dir, `index.js`));

  //   writeFileSync(indexFilePath, indexFile);

  //   return indexFilePath;
  // }

  // /** generates an index file that links to all of the files related to a specific preview */
  // private writePreviewLink(
  //   dir: string,
  //   name: string,
  //   modulePaths: ComponentMap<string[]>,
  //   templatePath?: string
  // ): [string, string] {
  //   const path = resolve(join(dir, `${name}.js`));
  //   const contents = generateLink(modulePaths, templatePath);
  //   writeFileSync(path, contents);

  //   return [name, path];
  // }

  // async getPreviewExtensions(context: ExecutionContext) {
  //   context.env.getPreviewExtensions();
  //   // const link = this.ui.createLink();

  //   return {};
  // }

  // /** generates an 'updater' file that injects previews into preview.preview.tsx */
  // private writeUpdater(dir: string, targetPath: string, previewMain: string) {
  //   const content = makePreviewRegister(targetPath, previewMain);
  //   const path = resolve(join(dir, `__registerPreview.js`));
  //   writeFileSync(path, content);

  //   return path;
  // }

  /**
   * register a new preview definition.
   */
  registerDefinition(previewDef: PreviewDefinition) {
    this.previewSlot.register(previewDef);
  }

  static slots = [Slot.withType<PreviewDefinition>()];

  static runtime = MainRuntime;
  static dependencies = [BundlerAspect, BuilderAspect, ComponentAspect, UIAspect, EnvsAspect];

  static async provider(
    [bundler, builder, componentExtension, uiMain, envs]: [BundlerMain, BuilderMain, ComponentMain, UiMain, EnvsMain],
    config,
    [previewSlot]: [PreviewDefinitionRegistry]
  ) {
    const preview = new PreviewMain(previewSlot, uiMain, envs);
    componentExtension.registerRoute([new PreviewRoute(preview)]);
    bundler.registerTarget([
      {
        entry: preview.getPreviewTarget.bind(preview),
      },
    ]);

    builder.registerTask(new PreviewTask(bundler, preview));

    return preview;
  }
}

PreviewAspect.addRuntime(PreviewMain);
