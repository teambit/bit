import { Slot, SlotRegistry } from '@teambit/harmony';
import { writeFileSync } from 'fs';
import { resolve, join } from 'path';
import { PreviewAspect } from './preview.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { generateLink } from './generate-link';
import { ComponentMap, ComponentAspect, ComponentMain } from '../component';
import { PreviewTask } from './preview.task';
import { PreviewDefinition } from './preview-definition';
import { ExecutionContext } from '../environments';
import { PreviewRoute } from './preview.route';
import { Component } from '../component';
import { PreviewArtifactNotFound } from './exceptions';
import { PreviewArtifact } from './preview-artifact';
import { BundlerAspect, BundlerMain } from '../bundler';
import { BuilderAspect, BuilderMain } from '../builder';

export type PreviewDefinitionRegistry = SlotRegistry<PreviewDefinition>;

export class PreviewMain {
  constructor(
    /**
     * slot for preview definitions.
     */
    private previewSlot: PreviewDefinitionRegistry
  ) {}

  async getPreview(component: Component): Promise<PreviewArtifact> {
    const entry = component.config.extensions.findCoreExtension(PreviewMain.id);
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

  static runtime = MainRuntime;
  static dependencies = [BundlerAspect, BuilderAspect, ComponentAspect];

  static async provider(
    [bundler, builder, componentExtension]: [BundlerMain, BuilderMain, ComponentMain],
    config,
    [previewSlot]: [PreviewDefinitionRegistry]
  ) {
    const preview = new PreviewMain(previewSlot);
    componentExtension.registerRoute([new PreviewRoute(preview)]);
    bundler.registerTarget([
      {
        entry: preview.getPreviewTarget.bind(preview),
      },
    ]);

    // builder.registerTask(new PreviewTask(bundler, preview));

    return preview;
  }
}

PreviewAspect.addRuntime(PreviewMain);
