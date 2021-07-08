import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { BundlerAspect, BundlerMain } from '@teambit/bundler';
import { PubsubAspect, PubsubMain } from '@teambit/pubsub';
import { MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect, ComponentMain, ComponentMap, ComponentID } from '@teambit/component';
import { EnvsAspect, EnvsMain, ExecutionContext, hasCompiler } from '@teambit/envs';
import { Slot, SlotRegistry, Harmony } from '@teambit/harmony';
import { UIAspect, UiMain } from '@teambit/ui';
import { CACHE_ROOT } from '@teambit/legacy/dist/constants';
import objectHash from 'object-hash';
import { uniq } from 'lodash';
import { writeFileSync, existsSync, mkdirSync } from 'fs-extra';
import { join } from 'path';
import { PkgAspect, PkgMain } from '@teambit/pkg';
import { AspectDefinition, AspectLoaderMain, AspectLoaderAspect } from '@teambit/aspect-loader';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { LoggerAspect, LoggerMain, Logger } from '@teambit/logger';
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
     * harmony context.
     */
    private harmony: Harmony,

    /**
     * slot for preview definitions.
     */
    private previewSlot: PreviewDefinitionRegistry,

    private ui: UiMain,

    private envs: EnvsMain,

    private pkg: PkgMain,

    private aspectLoader: AspectLoaderMain,

    readonly config: PreviewConfig,

    private bundlingStrategySlot: BundlingStrategySlot,

    private builder: BuilderMain,

    private workspace: Workspace | undefined,

    private logger: Logger
  ) {}

  get tempFolder(): string {
    return this.workspace?.getTempDir(PreviewAspect.id) || DEFAULT_TEMP_DIR;
  }

  async getPreview(component: Component): Promise<PreviewArtifact> {
    const artifacts = await this.builder.getArtifactsVinylByExtension(component, PreviewAspect.id);
    if (!artifacts.length) throw new PreviewArtifactNotFound(component.id);

    return new PreviewArtifact(artifacts);
  }

  getDefs(): PreviewDefinition[] {
    return this.previewSlot.values();
  }

  private writeHash = new Map<string, string>();
  private timestamp = Date.now();

  /**
   * write a link to load custom modules dynamically.
   * @param prefix write
   * @param moduleMap map of components to module paths to require.
   * @param defaultModule
   * @param dirName
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

  private componentsByAspect = new Map<string, RuntimeComponents>();

  private async getPreviewTarget(
    /** execution context (of the specific env) */
    context: ExecutionContext
  ): Promise<string[]> {
    // store context for later link-file updates
    // also register related envs that this context is acting on their behalf
    [context.id, ...context.relatedContexts].forEach((ctxId) => {
      this.componentsByAspect.set(ctxId, new RuntimeComponents(context.components, context));
    });

    const previewRuntime = await this.writePreviewRuntime(context);
    const linkFiles = await this.updateLinkFiles(context.components, context);

    return [...linkFiles, previewRuntime];
  }

  private updateLinkFiles(components: Component[] = [], context: ExecutionContext) {
    const previews = this.previewSlot.values();
    const paths = previews.map(async (previewDef) => {
      const templatePath = await previewDef.renderTemplatePath?.(context);

      const map = await previewDef.getModuleMap(components);
      const environment = context.envRuntime.env;

      const compilerInstance = hasCompiler(environment) && environment.getCompiler();
      const withPaths = map.map<string[]>((files, component) => {
        const modulePath = this.pkg.getModulePath(component);
        return files.map((file) => {
          if (!this.workspace || !compilerInstance) {
            return file.path;
          }
          const distRelativePath = compilerInstance.getDistPathBySrcPath(file.relative);
          return join(this.workspace.path, modulePath, distRelativePath);
        });
        // return files.map((file) => file.path);
      });

      const dirPath = join(this.tempFolder, context.id);
      if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });

      const link = this.writeLink(previewDef.prefix, withPaths, templatePath, dirPath);
      return link;
    });

    return Promise.all(paths);
  }

  async writePreviewRuntime(context: { components: Component[] }) {
    const ui = this.ui.getUi();
    if (!ui) throw new Error('ui not found');
    const [name, uiRoot] = ui;
    const resolvedAspects = await uiRoot.resolveAspects(PreviewRuntime.name);
    const filteredAspects = this.filterAspectsByExecutionContext(resolvedAspects, context);
    const filePath = await this.ui.generateRoot(filteredAspects, name, 'preview', PreviewAspect.id);
    return filePath;
  }

  /**
   * Filter the aspects to have only aspects that are:
   * 1. core aspects
   * 2. configured on the host (workspace/scope)
   * 3. used by at least one component from the context
   * @param aspects
   * @param context
   */
  private filterAspectsByExecutionContext(aspects: AspectDefinition[], context: { components: Component[] }) {
    let allComponentContextAspects: string[] = [];
    allComponentContextAspects = context.components.reduce((acc, curr) => {
      return acc.concat(curr.state.aspects.ids);
    }, allComponentContextAspects);
    const hostAspects = Object.keys(this.harmony.config.toObject());
    const allAspectsToInclude = uniq(hostAspects.concat(allComponentContextAspects));
    const filtered = aspects.filter((aspect) => {
      if (!aspect.getId) {
        return false;
      }
      return this.aspectLoader.isCoreAspect(aspect.getId) || allAspectsToInclude.includes(aspect.getId);
    });
    return filtered;
  }

  private getDefaultStrategies() {
    return [new EnvBundlingStrategy(this), new ComponentBundlingStrategy()];
  }

  // TODO - executionContext should be responsible for updating components list, and emit 'update' events
  // instead we keep track of changes
  private handleComponentChange = async (c: Component, updater: (currentComponents: RuntimeComponents) => void) => {
    const env = this.envs.getEnv(c);
    const envId = env.id.toString();

    const components = this.componentsByAspect.get(envId);
    if (!components) {
      this.logger.warn(
        `failed to update link file for component "${c.id.toString()}" - could not find execution context for ${envId}`
      );
      return noopResult;
    }

    // add / remove / etc
    updater(components);

    await this.updateLinkFiles(components.components, components.executionCtx);

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
    PkgAspect,
    PubsubAspect,
    AspectLoaderAspect,
    LoggerAspect,
  ];

  static defaultConfig = {
    bundlingStrategy: 'env',
    disabled: false,
  };

  static async provider(
    [bundler, builder, componentExtension, uiMain, envs, workspace, pkg, pubsub, aspectLoader, loggerMain]: [
      BundlerMain,
      BuilderMain,
      ComponentMain,
      UiMain,
      EnvsMain,
      Workspace | undefined,
      PkgMain,
      PubsubMain,
      AspectLoaderMain,
      LoggerMain
    ],
    config: PreviewConfig,
    [previewSlot, bundlingStrategySlot]: [PreviewDefinitionRegistry, BundlingStrategySlot],
    harmony: Harmony
  ) {
    const logger = loggerMain.createLogger(PreviewAspect.id);

    const preview = new PreviewMain(
      harmony,
      previewSlot,
      uiMain,
      envs,
      pkg,
      aspectLoader,
      config,
      bundlingStrategySlot,
      builder,
      workspace,
      logger
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
