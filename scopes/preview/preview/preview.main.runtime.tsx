import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { BundlerAspect, BundlerMain } from '@teambit/bundler';
import { PubsubAspect, PubsubMain } from '@teambit/pubsub';
import { MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect, ComponentMain, ComponentMap, ComponentID } from '@teambit/component';
import { EnvsAspect, EnvsMain, ExecutionContext } from '@teambit/envs';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { UIAspect, UiMain } from '@teambit/ui';
import { CACHE_ROOT } from '@teambit/legacy/dist/constants';
import objectHash from 'object-hash';
import { writeFileSync, existsSync, mkdirSync } from 'fs-extra';
import { join } from 'path';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
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
import { PreviewStartPlugin } from './preview.start-plugin';

const noopResult = {
  results: [],
  toString: () => `updating link file`,
};

const DEFAULT_TEMP_DIR = join(CACHE_ROOT, PreviewAspect.id);

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

    private tempFolder: string
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
  writeLink(prefix: string, moduleMap: ComponentMap<string[]>, defaultModule: string | undefined, dirName: string) {
    const contents = generateLink(prefix, moduleMap, defaultModule);
    const hash = objectHash(contents);
    const targetPath = join(dirName, `__${prefix}-${this.timestamp}.js`);

    // write only if link has changed (prevents triggering fs watches)
    if (this.writeHash.get(targetPath) !== hash) {
      writeFileSync(targetPath, contents);
      this.writeHash.set(targetPath, hash);
    }

    return targetPath;
  }

  private execContexts = new Map<string, ExecutionContext>();
  private componentsByAspect = new Map<string, RuntimeComponents>();

  private async getPreviewTarget(
    /** execution context (of the specific env) */
    context: ExecutionContext
  ): Promise<string[]> {
    // store context for later link file updates
    this.execContexts.set(context.id, context);
    this.componentsByAspect.set(context.id, new RuntimeComponents(context.components));

    const previewRuntime = await this.writePreviewRuntime();
    const linkFiles = await this.updateLinkFiles(context.components, context);

    return [...linkFiles, previewRuntime];
  }

  private updateLinkFiles(components: Component[] = [], context: ExecutionContext) {
    const previews = this.previewSlot.values();
    const paths = previews.map(async (previewDef) => {
      const templatePath = await previewDef.renderTemplatePath?.(context);

      const map = await previewDef.getModuleMap(components);
      const withPaths = map.map<string[]>((files) => {
        return files.map((file) => file.path);
      });

      const dirPath = join(this.tempFolder, context.id);
      if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });

      const link = this.writeLink(previewDef.prefix, withPaths, templatePath, dirPath);
      return link;
    });

    return Promise.all(paths);
  }

  async writePreviewRuntime() {
    const ui = this.ui.getUi();
    if (!ui) throw new Error('ui not found');
    const [name, uiRoot] = ui;
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

  // TODO - executionContext should be responsible for updating components list, and emit 'update' events
  // instead we keep track of changes
  private handleComponentChange = async (c: Component, updater: (currentComponents: RuntimeComponents) => void) => {
    const env = this.envs.getEnv(c);
    const envId = env.id.toString();

    const executionContext = this.execContexts.get(envId);
    const components = this.componentsByAspect.get(envId);
    if (!components || !executionContext) return noopResult;

    // add / remove / etc
    updater(components);

    await this.updateLinkFiles(components.components, executionContext);

    return noopResult;
  };

  private handleComponentRemoval = (cId: ComponentID) => {
    let component: Component | undefined;
    this.componentsByAspect.forEach((components) => {
      const found = components.get(cId);
      if (found) component = found;
    });
    if (!component) return Promise.resolve(noopResult);

    return this.handleComponentChange(component, (currentComponents) => currentComponents.remove(cId));
  };

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
    PubsubAspect,
  ];

  static defaultConfig = {
    bundlingStrategy: 'env',
    disabled: false,
  };

  static async provider(
    [bundler, builder, componentExtension, uiMain, envs, workspace, pubsub]: [
      BundlerMain,
      BuilderMain,
      ComponentMain,
      UiMain,
      EnvsMain,
      Workspace | undefined,
      PubsubMain
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
      workspace?.getTempDir(PreviewAspect.id) || DEFAULT_TEMP_DIR
    );

    if (workspace) uiMain.registerStartPlugin(new PreviewStartPlugin(workspace, bundler, uiMain, pubsub));

    componentExtension.registerRoute([new PreviewRoute(preview)]);
    bundler.registerTarget([
      {
        entry: preview.getPreviewTarget.bind(preview),
      },
    ]);

    if (!config.disabled) builder.registerBuildTasks([new PreviewTask(bundler, preview)]);

    if (workspace) {
      workspace.registerOnComponentAdd((c) =>
        preview.handleComponentChange(c, (currentComponents) => currentComponents.add(c))
      );
      workspace.registerOnComponentChange((c) =>
        preview.handleComponentChange(c, (currentComponents) => currentComponents.update(c))
      );
      workspace.registerOnComponentRemove((cId) => preview.handleComponentRemoval(cId));
    }

    return preview;
  }
}

PreviewAspect.addRuntime(PreviewMain);
