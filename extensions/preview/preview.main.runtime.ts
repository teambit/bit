import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { BundlerAspect, BundlerMain } from '@teambit/bundler';
import { MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect, ComponentMain, ComponentMap } from '@teambit/component';
import { EnvsAspect, EnvsMain, ExecutionContext } from '@teambit/environments';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { UIAspect, UiMain } from '@teambit/ui';
import { writeFileSync } from 'fs-extra';
import { flatten } from 'lodash';
import { join, resolve } from 'path';

import { PreviewArtifactNotFound } from './exceptions';
import { generateLink } from './generate-link';
import { PreviewArtifact } from './preview-artifact';
import { PreviewDefinition } from './preview-definition';
import { PreviewAspect, PreviewRuntime } from './preview.aspect';
import { PreviewRoute } from './preview.route';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    return flatten(resolved).concat([previewRuntime]);
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

    // builder.registerTask(new PreviewTask(bundler, preview));

    return preview;
  }
}

PreviewAspect.addRuntime(PreviewMain);
