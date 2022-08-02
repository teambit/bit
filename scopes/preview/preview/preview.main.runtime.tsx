import { ArtifactFactory, BuilderAspect } from '@teambit/builder';
import type { BuilderMain } from '@teambit/builder';
import { Asset, BundlerAspect, BundlerMain } from '@teambit/bundler';
import { PubsubAspect, PubsubMain } from '@teambit/pubsub';
import { MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect, ComponentMain, ComponentMap, ComponentID, ResolveAspectsOptions } from '@teambit/component';
import { EnvsAspect } from '@teambit/envs';
import type { EnvsMain, ExecutionContext, PreviewEnv } from '@teambit/envs';
import { Slot, SlotRegistry, Harmony } from '@teambit/harmony';
import { UIAspect, UiMain, UIRoot } from '@teambit/ui';
import { CACHE_ROOT } from '@teambit/legacy/dist/constants';
import { BitError } from '@teambit/bit-error';
import objectHash from 'object-hash';
import { uniq } from 'lodash';
import { writeFileSync, existsSync, mkdirSync } from 'fs-extra';
import { join } from 'path';
import { PkgAspect, PkgMain } from '@teambit/pkg';
import { AspectLoaderAspect, getAspectDir, getAspectDirFromBvm } from '@teambit/aspect-loader';
import type { AspectDefinition, AspectLoaderMain } from '@teambit/aspect-loader';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { LoggerAspect, LoggerMain, Logger } from '@teambit/logger';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { ArtifactFiles } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import GraphqlAspect, { GraphqlMain } from '@teambit/graphql';
import { BundlingStrategyNotFound } from './exceptions';
import { generateLink } from './generate-link';
import { PreviewArtifact } from './preview-artifact';
import { PreviewDefinition } from './preview-definition';
import { PreviewAspect, PreviewRuntime } from './preview.aspect';
import { PreviewRoute } from './preview.route';
import { PreviewTask, PREVIEW_TASK_NAME } from './preview.task';
import { BundlingStrategy } from './bundling-strategy';
import { EnvBundlingStrategy, ComponentBundlingStrategy } from './strategies';
import { ExecutionRef } from './execution-ref';
import { PreviewStartPlugin } from './preview.start-plugin';
import {
  EnvPreviewTemplateTask,
  GENERATE_ENV_TEMPLATE_TASK_NAME,
  getArtifactDef as getEnvTemplateArtifactDef,
} from './env-preview-template.task';
import { EnvTemplateRoute } from './env-template.route';
import { ComponentPreviewRoute } from './component-preview.route';
import { COMPONENT_STRATEGY_ARTIFACT_NAME, COMPONENT_STRATEGY_SIZE_KEY_NAME } from './strategies/component-strategy';
import { ENV_STRATEGY_ARTIFACT_NAME } from './strategies/env-strategy';
import { previewSchema } from './preview.graphql';
import { PreviewAssetsRoute } from './preview-assets.route';

const noopResult = {
  results: [],
  toString: () => `updating link file`,
};

const DEFAULT_TEMP_DIR = join(CACHE_ROOT, PreviewAspect.id);

export type PreviewDefinitionRegistry = SlotRegistry<PreviewDefinition>;

type PreviewFiles = {
  files: string[];
  isBundledWithEnv: boolean;
};

export type ComponentPreviewSizedFile = Asset;

export type ComponentPreviewSize = {
  files: ComponentPreviewSizedFile[];
  assets: ComponentPreviewSizedFile[];
  totalFiles: number;
  compressedTotalFiles?: number;
  totalAssets: number;
  compressedTotalAssets?: number;
  total: number;
  compressedTotal?: number;
};

export type ComponentPreviewMetaData = {
  size?: ComponentPreviewSize;
};

export type PreviewConfig = {
  bundlingStrategy?: string;
  disabled: boolean;
  /**
   * limit concurrent components when running the bundling step for your bundler during generate components preview task.
   * this helps mitigate large memory consumption for the build pipeline. This may increase the overall time for the generate-preview task, but reduce memory footprint.
   * default - no limit.
   */
  maxChunkSize?: number;
};

export type EnvPreviewConfig = {
  strategyName?: string;
  splitComponentBundle?: boolean;
};

export type BundlingStrategySlot = SlotRegistry<BundlingStrategy>;

export type GenerateLinkFn = (prefix: string, componentMap: ComponentMap<string[]>, defaultModule?: string) => string;

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

    private componentAspect: ComponentMain,

    private pkg: PkgMain,

    private aspectLoader: AspectLoaderMain,

    readonly config: PreviewConfig,

    private bundlingStrategySlot: BundlingStrategySlot,

    private builder: BuilderMain,

    private workspace: Workspace | undefined,

    private logger: Logger,

    private dependencyResolver: DependencyResolverMain
  ) {}

  get tempFolder(): string {
    return this.workspace?.getTempDir(PreviewAspect.id) || DEFAULT_TEMP_DIR;
  }

  getComponentBundleSize(component: Component): ComponentPreviewSize | undefined {
    const data = this.builder.getDataByAspect(component, PreviewAspect.id);

    if (!data) return undefined;
    return data[COMPONENT_STRATEGY_SIZE_KEY_NAME];
  }

  async getPreview(component: Component): Promise<PreviewArtifact | undefined> {
    const artifacts = await this.builder.getArtifactsVinylByExtensionAndTaskName(
      component,
      PreviewAspect.id,
      PREVIEW_TASK_NAME
    );
    if (!artifacts) return undefined;
    return new PreviewArtifact(artifacts);
  }

  /**
   * Get a list of all the artifact files generated during the GeneratePreview task
   * @param component
   * @returns
   */
  async getPreviewFiles(component: Component): Promise<PreviewFiles | undefined> {
    const artifacts = await this.getPreview(component);
    const isBundledWithEnv = await this.isBundledWithEnv(component);
    if (!artifacts) return undefined;
    return {
      files: artifacts.getPaths(),
      isBundledWithEnv,
    };
  }

  /**
   * Check if the component preview bundle contain the env as part of the bundle or only the component code
   * (we used in the past to bundle them together, there might also be specific envs which still uses the env strategy)
   * @param component
   * @returns
   */
  async isBundledWithEnv(component: Component): Promise<boolean> {
    const artifacts = await this.builder.getArtifactsVinylByExtensionAndName(
      component,
      PreviewAspect.id,
      COMPONENT_STRATEGY_ARTIFACT_NAME
    );
    if (!artifacts || !artifacts.length) return true;

    return false;
  }

  /**
   * Check if the component preview bundle contain the header inside of it (legacy)
   * today we are not including the header inside anymore
   * @param component
   * @returns
   */
  async isLegacyHeader(component: Component): Promise<boolean> {
    // these envs had header in their docs
    const ENV_WITH_LEGACY_DOCS = ['react', 'env', 'aspect', 'lit', 'html', 'node', 'mdx', 'react-native', 'readme'];

    const artifacts = await this.builder.getArtifactsVinylByExtensionAndName(
      component,
      PreviewAspect.id,
      ENV_STRATEGY_ARTIFACT_NAME
    );
    const envType = this.envs.getEnvData(component).type;
    return !!artifacts && !!artifacts.length && ENV_WITH_LEGACY_DOCS.includes(envType);
  }

  /**
   * Getting the env template artifact
   * This should be called with the env itself or it will return undefined
   * If you want to get the env template from the env of the component,
   * use: getEnvTemplateFromComponentEnv below
   *
   * @param component
   * @returns
   */
  async getEnvTemplate(component: Component): Promise<PreviewArtifact | undefined> {
    const artifacts = await this.builder.getArtifactsVinylByExtensionAndTaskName(
      component,
      PreviewAspect.id,
      GENERATE_ENV_TEMPLATE_TASK_NAME
    );
    if (!artifacts || !artifacts.length) return undefined;

    return new PreviewArtifact(artifacts);
  }

  /**
   * This is a special method to get a core env template
   * As the core envs doesn't exist in the scope we need to bring it from other place
   * We will bring it from the core env package files
   */
  private async getCoreEnvTemplate(envId: string): Promise<PreviewArtifact | undefined> {
    const coreEnvDir = getAspectDir(envId);
    // const finalDir = join(coreEnvDir, getEnvTemplateArtifactDirectory());
    const artifactDef = getEnvTemplateArtifactDef()[0];
    const artifactFactory = new ArtifactFactory();

    let rootDir = artifactFactory.getRootDir(coreEnvDir, artifactDef);
    if (!existsSync(rootDir)) {
      // fallback to the bvm folder
      const coreEnvDirFromBvm = getAspectDirFromBvm(envId);
      rootDir = artifactFactory.getRootDir(coreEnvDirFromBvm, artifactDef);
    }
    if (!existsSync(rootDir)) {
      return undefined;
    }
    const paths = artifactFactory.resolvePaths(rootDir, artifactDef);
    if (!paths || !paths.length) {
      return undefined;
    }
    const artifactFiles = new ArtifactFiles(paths);

    artifactFiles.populateVinylsFromPaths(rootDir);
    return new PreviewArtifact(artifactFiles.vinyls);
  }

  /**
   * This will fetch the component env, then will take the env template from the component env
   * @param component
   */
  async getEnvTemplateFromComponentEnv(component: Component): Promise<PreviewArtifact | undefined> {
    const envId = this.envs.getEnvId(component);
    return this.getEnvTemplateByEnvId(envId);
  }

  /**
   * This will fetch the component env, then will take the env template from the component env
   * @param component
   */
  async getEnvTemplateByEnvId(envId: string): Promise<PreviewArtifact | undefined> {
    // Special treatment for core envs
    if (this.aspectLoader.isCoreEnv(envId)) {
      return this.getCoreEnvTemplate(envId);
    }
    const host = this.componentAspect.getHost();
    const resolvedEnvId = await host.resolveComponentId(envId);
    const envComponent = await host.get(resolvedEnvId);
    if (!envComponent) {
      throw new BitError(`can't load env. env id is ${envId}`);
    }
    return this.getEnvTemplate(envComponent);
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
  writeLink(
    prefix: string,
    moduleMap: ComponentMap<string[]>,
    defaultModule: string | undefined,
    dirName: string,
    isSplitComponentBundle: boolean
  ) {
    const contents = generateLink(prefix, moduleMap, defaultModule, isSplitComponentBundle);
    return this.writeLinkContents(contents, dirName, prefix);
  }

  writeLinkContents(contents: string, targetDir: string, prefix: string) {
    const hash = objectHash(contents);
    const targetPath = join(targetDir, `${prefix}-${this.timestamp}.js`);

    // write only if link has changed (prevents triggering fs watches)
    if (this.writeHash.get(targetPath) !== hash) {
      writeFileSync(targetPath, contents);
      this.writeHash.set(targetPath, hash);
    }

    return targetPath;
  }

  private executionRefs = new Map<string, ExecutionRef>();

  private async getPreviewTarget(
    /** execution context (of the specific env) */
    context: ExecutionContext
  ): Promise<string[]> {
    // store context for later link-file updates
    // also register related envs that this context is acting on their behalf
    [context.id, ...context.relatedContexts].forEach((ctxId) => {
      this.executionRefs.set(ctxId, new ExecutionRef(context));
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
      const isSplitComponentBundle = this.getEnvPreviewConfig().splitComponentBundle ?? false;
      const withPaths = map.map<string[]>((files, component) => {
        const environment = this.envs.getEnv(component).env;
        const compilerInstance = environment.getCompiler?.();
        const modulePath =
          compilerInstance?.getPreviewComponentRootPath?.(component) || this.pkg.getRuntimeModulePath(component);
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

      const link = this.writeLink(previewDef.prefix, withPaths, templatePath, dirPath, isSplitComponentBundle);
      return link;
    });

    return Promise.all(paths);
  }

  async writePreviewRuntime(context: { components: Component[] }, aspectsIdsToNotFilterOut: string[] = []) {
    const [name, uiRoot] = this.getUi();
    const resolvedAspects = await this.resolveAspects(PreviewRuntime.name, undefined, uiRoot);
    const filteredAspects = this.filterAspectsByExecutionContext(resolvedAspects, context, aspectsIdsToNotFilterOut);
    const filePath = await this.ui.generateRoot(filteredAspects, name, 'preview', PreviewAspect.id);
    return filePath;
  }

  async resolveAspects(
    runtimeName?: string,
    componentIds?: ComponentID[],
    uiRoot?: UIRoot,
    opts?: ResolveAspectsOptions
  ): Promise<AspectDefinition[]> {
    const root = uiRoot || this.getUi()[1];
    runtimeName = runtimeName || MainRuntime.name;
    const resolvedAspects = await root.resolveAspects(runtimeName, componentIds, opts);
    return resolvedAspects;
  }

  private getUi() {
    const ui = this.ui.getUi();
    if (!ui) throw new Error('ui not found');
    return ui;
  }

  /**
   * Filter the aspects to have only aspects that are:
   * 1. core aspects
   * 2. configured on the host (workspace/scope)
   * 3. used by at least one component from the context
   * @param aspects
   * @param context
   */
  private filterAspectsByExecutionContext(
    aspects: AspectDefinition[],
    context: { components: Component[] },
    aspectsIdsToNotFilterOut: string[] = []
  ) {
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
      return (
        this.aspectLoader.isCoreAspect(aspect.getId) ||
        allAspectsToInclude.includes(aspect.getId) ||
        aspectsIdsToNotFilterOut.includes(aspect.getId)
      );
    });

    return filtered;
  }

  private getDefaultStrategies() {
    return [
      new EnvBundlingStrategy(this, this.pkg, this.dependencyResolver),
      new ComponentBundlingStrategy(this, this.pkg, this.dependencyResolver),
    ];
  }

  // TODO - executionContext should be responsible for updating components list, and emit 'update' events
  // instead we keep track of changes
  private handleComponentChange = async (c: Component, updater: (currentComponents: ExecutionRef) => void) => {
    const env = this.envs.getEnv(c);
    const envId = env.id.toString();

    const executionRef = this.executionRefs.get(envId);
    if (!executionRef) {
      this.logger.warn(
        `failed to update link file for component "${c.id.toString()}" - could not find execution context for ${envId}`
      );
      return noopResult;
    }

    // add / remove / etc
    updater(executionRef);

    await this.updateLinkFiles(executionRef.currentComponents, executionRef.executionCtx);

    return noopResult;
  };

  private handleComponentRemoval = (cId: ComponentID) => {
    let component: Component | undefined;
    this.executionRefs.forEach((components) => {
      const found = components.get(cId);
      if (found) component = found;
    });
    if (!component) return Promise.resolve(noopResult);

    return this.handleComponentChange(component, (currentComponents) => currentComponents.remove(cId));
  };

  getEnvPreviewConfig(env?: PreviewEnv): EnvPreviewConfig {
    const config = env?.getPreviewConfig && typeof env?.getPreviewConfig === 'function' ? env?.getPreviewConfig() : {};

    return config;
  }

  /**
   * return the configured bundling strategy.
   */
  getBundlingStrategy(env?: PreviewEnv): BundlingStrategy {
    const defaultStrategies = this.getDefaultStrategies();
    const envPreviewConfig = this.getEnvPreviewConfig(env);
    const strategyFromEnv = envPreviewConfig?.strategyName;
    const strategyName = strategyFromEnv || this.config.bundlingStrategy || 'env';
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
    DependencyResolverAspect,
    GraphqlAspect,
  ];

  static defaultConfig = {
    disabled: false,
  };

  static async provider(
    // eslint-disable-next-line max-len
    [
      bundler,
      builder,
      componentExtension,
      uiMain,
      envs,
      workspace,
      pkg,
      pubsub,
      aspectLoader,
      loggerMain,
      dependencyResolver,
      graphql,
    ]: [
      BundlerMain,
      BuilderMain,
      ComponentMain,
      UiMain,
      EnvsMain,
      Workspace | undefined,
      PkgMain,
      PubsubMain,
      AspectLoaderMain,
      LoggerMain,
      DependencyResolverMain,
      GraphqlMain
    ],
    config: PreviewConfig,
    [previewSlot, bundlingStrategySlot]: [PreviewDefinitionRegistry, BundlingStrategySlot],
    harmony: Harmony
  ) {
    const logger = loggerMain.createLogger(PreviewAspect.id);
    // app.registerApp(new PreviewApp());
    const preview = new PreviewMain(
      harmony,
      previewSlot,
      uiMain,
      envs,
      componentExtension,
      pkg,
      aspectLoader,
      config,
      bundlingStrategySlot,
      builder,
      workspace,
      logger,
      dependencyResolver
    );

    if (workspace) uiMain.registerStartPlugin(new PreviewStartPlugin(workspace, bundler, uiMain, pubsub, logger));

    componentExtension.registerRoute([
      new PreviewRoute(preview, logger),
      new ComponentPreviewRoute(preview, logger),
      // @ts-ignore
      new EnvTemplateRoute(preview, logger),
      new PreviewAssetsRoute(preview, logger),
    ]);

    bundler.registerTarget([
      {
        entry: preview.getPreviewTarget.bind(preview),
      },
    ]);

    if (!config.disabled)
      builder.registerBuildTasks([
        new EnvPreviewTemplateTask(preview, envs, aspectLoader, dependencyResolver, logger),
        new PreviewTask(bundler, preview, dependencyResolver, logger),
      ]);

    if (workspace) {
      workspace.registerOnComponentAdd((c) =>
        preview.handleComponentChange(c, (currentComponents) => currentComponents.add(c))
      );
      workspace.registerOnComponentChange((c) =>
        preview.handleComponentChange(c, (currentComponents) => currentComponents.update(c))
      );
      workspace.registerOnComponentRemove((cId) => preview.handleComponentRemoval(cId));
    }

    graphql.register(previewSchema(preview));

    return preview;
  }
}

PreviewAspect.addRuntime(PreviewMain);
