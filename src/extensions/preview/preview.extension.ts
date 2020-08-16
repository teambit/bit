import { Slot, SlotRegistry } from '@teambit/harmony';
import { writeFileSync } from 'fs';
import { resolve, join } from 'path';
import { generateLink } from './generate-link';
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

  getDefs() {
    return this.previewSlot.values();
  }

  async getPreviewTarget(context: ExecutionContext): Promise<string[]> {
    const previewMain = require.resolve('./preview.runtime');
    const previews = this.previewSlot.values();

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

      const outputFiles = map
        .toArray()
        .flatMap(([, files]) => {
          return files.map((file) => file.path);
        })
        .concat([link]);

      return outputFiles;
    });

    const resolved = await Promise.all(paths);
    return resolved.flatMap((array) => array).concat([previewMain]);
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
