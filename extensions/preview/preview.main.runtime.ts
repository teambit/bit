import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { BundlerAspect, BundlerMain } from '@teambit/bundler';
import { MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect, ComponentMain, ComponentMap } from '@teambit/component';
import { EnvsAspect, EnvsMain, ExecutionContext } from '@teambit/environments';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { UIAspect, UiMain } from '@teambit/ui';
import { checksum } from '@teambit/crypto.checksum';
import { writeFileSync } from 'fs-extra';
import { join } from 'path';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { CacheAspect, CacheMain } from '@teambit/cache';
import { PreviewArtifactNotFound, BundlingStrategyNotFound } from './exceptions';
import { generateLink } from './generate-link';
import { PreviewArtifact } from './preview-artifact';
import { PreviewDefinition } from './preview-definition';
import { PreviewAspect, PreviewRuntime } from './preview.aspect';
import { PreviewRoute } from './preview.route';
import { PreviewTask } from './preview.task';
import { BundlingStrategy } from './bundling-strategy';
import { EnvBundlingStrategy, ComponentBundlingStrategy } from './strategies';
import { RuntimeComponents } from './runtime-components';

const noopResult = Promise.resolve({
  results: [],
  toString: () => `updating link file`,
});

export type PreviewDefinitionRegistry = SlotRegistry<PreviewDefinition>;

export type PreviewConfig = {
  bundlingStrategy: string;
  disabled: boolean;
};

export type BundlingStrategySlot = SlotRegistry<BundlingStrategy>;

export class PreviewMain {
  constructor(
    /**
     * slot for preview definitions.
     */
    private previewSlot: PreviewDefinitionRegistry,

    private ui: UiMain,

    private envs: EnvsMain,

    readonly config: PreviewConfig,

    private bundlingStrategySlot: BundlingStrategySlot,

    private builder: BuilderMain,

    private cacheFolder: string
  ) {}

  async getPreview(component: Component): Promise<PreviewArtifact> {
    const artifacts = await this.builder.getArtifactsVinylByExtension(component, PreviewAspect.id);
    if (!artifacts.length) throw new PreviewArtifactNotFound(component.id);

    return new PreviewArtifact(artifacts);
  }

  getDefs() {
    return this.previewSlot.values();
  }

  private writeHash = new Map<string, string>();
  private timestamp = Date.now();

  /**
   * write a link for a loading custom modules dynamically.
   * @param prefix write
   * @param moduleMap map of components to module paths to require.
   * @param defaultModule
   */
  writeLink(
    prefix: string,
    moduleMap: ComponentMap<string[]>,
    defaultModule?: string,
    dirName: string = this.cacheFolder
  ) {
    const contents = generateLink(prefix, moduleMap, defaultModule);
    const hash = checksum(contents);
    const targetPath = join(dirName, `__${prefix}-${this.timestamp}.js`);

    // write only if link has changed (prevents triggering fs watches)
    if (this.writeHash.get(targetPath) !== hash) {
      writeFileSync(targetPath, contents);
      this.writeHash.set(targetPath, hash);
    }

    return targetPath;
  }

  private runtimeComponents?: RuntimeComponents;
  private execContext?: ExecutionContext;

  private async getPreviewTarget(context: ExecutionContext): Promise<string[]> {
    this.execContext = context;
    this.runtimeComponents = new RuntimeComponents(context.components);

    const previewRuntime = await this.writePreviewRuntime();
    const linkFiles = await this.updateLinkFiles(context.components, context);

    return [...linkFiles, previewRuntime];
  }

  private updateLinkFiles(components: Component[] = [], context: ExecutionContext | undefined = this.execContext) {
    if (!context) return []; // might happen if components change before initial bundle.

    const previews = this.previewSlot.values();
    const paths = previews.map(async (previewDef) => {
      const map = await previewDef.getModuleMap(components);

      const withPaths = map.map<string[]>((files) => {
        return files.map((file) => file.path);
      });

      const link = this.writeLink(
        previewDef.prefix,
        withPaths,
        previewDef.renderTemplatePath ? await previewDef.renderTemplatePath(context) : undefined
      );

      return link;
    });

    return Promise.all(paths);
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

  private getDefaultStrategies() {
    return [new EnvBundlingStrategy(this), new ComponentBundlingStrategy()];
  }

  /**
   * return the configured bundling strategy.
   */
  getBundlingStrategy(): BundlingStrategy {
    const defaultStrategies = this.getDefaultStrategies();
    const strategyName = this.config.bundlingStrategy;
    const strategies = this.bundlingStrategySlot.values().concat(defaultStrategies);
    const selected = strategies.find((strategy) => {
      return strategy.name === strategyName;
    });

    if (!selected) throw new BundlingStrategyNotFound(strategyName);

    return selected;
  }

  /**
   * register a new bundling strategy. default available strategies are `env` and ``
   */
  registerBundlingStrategy(bundlingStrategy: BundlingStrategy) {
    this.bundlingStrategySlot.register(bundlingStrategy);
    return this;
  }

  /**
   * register a new preview definition.
   */
  registerDefinition(previewDef: PreviewDefinition) {
    this.previewSlot.register(previewDef);
  }

  static slots = [Slot.withType<PreviewDefinition>(), Slot.withType<BundlingStrategy>()];

  static runtime = MainRuntime;
  static dependencies = [
    BundlerAspect,
    BuilderAspect,
    ComponentAspect,
    UIAspect,
    EnvsAspect,
    WorkspaceAspect,
    CacheAspect,
  ];

  static defaultConfig = {
    bundlingStrategy: 'env',
    disabled: false,
  };

  static async provider(
    [bundler, builder, componentExtension, uiMain, envs, workspace, cacheMain]: [
      BundlerMain,
      BuilderMain,
      ComponentMain,
      UiMain,
      EnvsMain,
      Workspace,
      CacheMain
    ],
    config: PreviewConfig,
    [previewSlot, bundlingStrategySlot]: [PreviewDefinitionRegistry, BundlingStrategySlot]
  ) {
    const preview = new PreviewMain(
      previewSlot,
      uiMain,
      envs,
      config,
      bundlingStrategySlot,
      builder,
      cacheMain.getCacheFolder(PreviewAspect.id)
    );

    componentExtension.registerRoute([new PreviewRoute(preview)]);
    bundler.registerTarget([
      {
        entry: preview.getPreviewTarget.bind(preview),
      },
    ]);

    if (!config.disabled) builder.registerBuildTask(new PreviewTask(bundler, preview));

    // TODO - workspace is never undefined
    if (workspace) {
      workspace.registerOnComponentAdd((x) => {
        preview.runtimeComponents?.add(x);
        preview.updateLinkFiles(preview.runtimeComponents?.components);
        return noopResult;
      });

      workspace.registerOnComponentChange((x) => {
        preview.runtimeComponents?.update(x);
        preview.updateLinkFiles(preview.runtimeComponents?.components);
        return noopResult;
      });

      workspace.registerOnComponentRemove((x) => {
        preview.runtimeComponents?.remove(x);
        preview.updateLinkFiles(preview.runtimeComponents?.components);
        return noopResult;
      });
    }

    return preview;
  }
}

PreviewAspect.addRuntime(PreviewMain);
