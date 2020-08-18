import { Slot, SlotRegistry } from '@teambit/harmony';
import { writeFileSync } from 'fs';
import { resolve, join } from 'path';
import { generateLink, makeReExport, makeLinkUpdater } from './generate-link';
import { ComponentMap } from '../component/component-map';
import { BundlerExtension } from '../bundler';
import { BuilderExtension } from '../builder';
import { PreviewTask } from './preview.task';
import { PreviewDefinition } from './preview-definition';
import { ExecutionContext } from '../environments';
import { PreviewRoute } from './preview.route';
import { Component, ComponentExtension } from '../component';
import { PreviewArtifactNotFound } from './exceptions';
import { PreviewArtifact } from './preview-artifact';
import { makeTempDir } from './mk-temp-dir';

export type PreviewDefinitionRegistry = SlotRegistry<PreviewDefinition>;

export class PreviewExtension {
  static id = '@teambit/preview';
  constructor(
    /**
     * slot for preview definitions.
     */
    private previewSlot: PreviewDefinitionRegistry
  ) {}

  async getPreview(component: Component): Promise<PreviewArtifact> {
    const entry = component.config.extensions.findCoreExtension(PreviewExtension.id);
    if (!entry) throw new PreviewArtifactNotFound(component.id);
    const artifacts = entry.artifacts;
    if (!artifacts) throw new PreviewArtifactNotFound(component.id);

    // @ts-ignore TODO: remove after @david fixes issue with artifacts type.
    return new PreviewArtifact(artifacts);
  }

  // /**
  //  * write a link for a loading custom modules dynamically.
  //  * @param prefix write
  //  * @param moduleMap map of components to module paths to require.
  //  * @param defaultModule
  //  */
  // writeLink(filepath: string, moduleMap: ComponentMap<string[]>, defaultModule: string | undefined) {
  //   const contents = generateLink(moduleMap, defaultModule);
  //   const targetPath = resolve(filepath);
  //   writeFileSync(targetPath, contents);

  //   return targetPath;
  // }

  getDefs() {
    return this.previewSlot.values();
  }

  async getPreviewTarget(context: ExecutionContext): Promise<string[]> {
    const previews = this.previewSlot.values();

    const previewLinks = await Promise.all(
      previews.map(async (p) => {
        const moduleMap = await p.getModuleMap(context.components);

        return {
          name: p.prefix,
          modulePaths: moduleMap.map((files) => files.map((file) => file.path)),
          templatePath: await p.renderTemplatePath?.(context),
        };
      })
    );

    const indexPath = this.writeLinks(previewLinks);

    return [require.resolve('./preview.runtime'), indexPath];
  }

  /** writes a series of link files that will load the component preview. */
  writeLinks(
    /** previews data structure to serialize and write down */
    previews: { name: string; modulePaths: ComponentMap<string[]>; templatePath?: string }[],
    /** folder to write links at. (Default - os.temp) */
    dir: string = makeTempDir()
  ) {
    const linkFiles = previews.map(({ name, modulePaths, templatePath }) =>
      this.writePreviewLink(dir, name, modulePaths, templatePath)
    );

    const indexFilePath = this.writeIndexFile(linkFiles, dir);
    const updaterPath = this.writeUpdater(dir, indexFilePath);

    return updaterPath;
  }

  /** generates a index file that links to all of the preview files  */
  private writeIndexFile(linkFiles: [string, string][], dir: string) {
    const indexFile = makeReExport(linkFiles);
    const indexFilePath = resolve(join(dir, `index.js`));

    writeFileSync(indexFilePath, indexFile);

    return indexFilePath;
  }

  /** generates an index file that links to all of the files related to a specific preview */
  private writePreviewLink(
    dir: string,
    name: string,
    modulePaths: ComponentMap<string[]>,
    templatePath?: string
  ): [string, string] {
    const path = resolve(join(dir, `${name}.js`));
    const contents = generateLink(modulePaths, templatePath);
    writeFileSync(path, contents);

    return [name, path];
  }

  /** generates an 'updater' file that injects previews into preview.preview.tsx */
  private writeUpdater(dir: string, targetPath: string) {
    const content = makeLinkUpdater(targetPath);
    const path = resolve(join(dir, `__updater.js`));
    writeFileSync(path, content);

    return path;
  }

  /**
   * register a new preview definition.
   */
  registerDefinition(previewDef: PreviewDefinition) {
    this.previewSlot.register(previewDef);
  }

  static slots = [Slot.withType<PreviewDefinition>()];

  static dependencies = [BundlerExtension, BuilderExtension, ComponentExtension];

  static async provider(
    [bundler, builder, componentExtension]: [BundlerExtension, BuilderExtension, ComponentExtension],
    config,
    [previewSlot]: [PreviewDefinitionRegistry]
  ) {
    const preview = new PreviewExtension(previewSlot);
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
