import { sha1 } from '@teambit/legacy/dist/utils';
import { Compiler } from '@teambit/compiler';
import { BuilderAspect, BuilderMain, BuildContext } from '@teambit/builder';
import { BundlerAspect, BundlerMain } from '@teambit/bundler';
import { PubsubAspect, PubsubMain } from '@teambit/pubsub';
import { MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect, ComponentMain, ComponentMap, ComponentID } from '@teambit/component';
import { EnvsAspect, EnvsMain, ExecutionContext, hasCompiler } from '@teambit/envs';
import { Slot, SlotRegistry, Harmony } from '@teambit/harmony';
import { UIAspect, UiMain } from '@teambit/ui';
import { CACHE_ROOT } from '@teambit/legacy/dist/constants';
import objectHash from 'object-hash';
import { uniq, groupBy } from 'lodash';
import fs, { writeFileSync, existsSync, mkdirSync } from 'fs-extra';
import { join, resolve } from 'path';
import { PkgAspect, PkgMain } from '@teambit/pkg';
import { AspectDefinition, AspectLoaderMain, AspectLoaderAspect } from '@teambit/aspect-loader';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { LoggerAspect, LoggerMain, Logger } from '@teambit/logger';
import { PreviewArtifactNotFound, BundlingStrategyNotFound } from './exceptions';
import { generateLink } from './generate-link';
import { generateMfLink } from './generate-mf-link';
import { PreviewArtifact } from './preview-artifact';
import { PreviewDefinition } from './preview-definition';
import { PreviewAspect, PreviewRuntime } from './preview.aspect';
import { PreviewRoute } from './preview.route';
import { PreviewTask } from './preview.task';
import { BundlingStrategy } from './bundling-strategy';
import { EnvBundlingStrategy, ComponentBundlingStrategy } from './strategies';
import { ExecutionRef } from './execution-ref';
import { PreviewStartPlugin } from './preview.start-plugin';
import { computeExposes } from './compute-exposes';
import { generateBootstrapFile } from './generate-bootstrap-file';
import { EnvMfBundlingStrategy } from './strategies/env-mf-strategy';
import { GenerateEnvPreviewTask } from './bundle-env.task';
import { createHostRoot } from './create-host-root';
import { createCoreRoot } from './create-core-root';
import { createRootBootstrap } from './create-root-bootstrap';

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
    console.log('targetPath', targetPath);

    // write only if link has changed (prevents triggering fs watches)
    if (this.writeHash.get(targetPath) !== hash) {
      writeFileSync(targetPath, contents);
      this.writeHash.set(targetPath, hash);
    }

    return targetPath;
  }

  async writeMfLink(
    prefix: string,
    // context: ExecutionContext,
    moduleMap: ComponentMap<string[]>,
    defaultModule: string | undefined,
    dirName: string
  ) {
    // const exposes = await this.computeExposesFromExecutionContext(context);

    const contents = generateMfLink(prefix, moduleMap, defaultModule);
    const hash = objectHash(contents);
    const targetPath = join(dirName, `__${prefix}-${this.timestamp}.js`);

    // write only if link has changed (prevents triggering fs watches)
    if (this.writeHash.get(targetPath) !== hash) {
      writeFileSync(targetPath, contents);
      this.writeHash.set(targetPath, hash);
    }

    return targetPath;
  }

  private executionRefs = new Map<string, ExecutionRef>();

  // TODO: consolidate code duplication with the env-strategy computePaths logic
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
    // throw new Error('g');
    const { bootstrapFileName } = this.createBootstrapFile([...linkFiles, previewRuntime], context);
    const indexEntryPath = this.createIndexEntryFile(bootstrapFileName, context);
    return [indexEntryPath];
  }

  private async updateLinkFiles(components: Component[] = [], context: ExecutionContext, useMf = true) {
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
      console.log('dirPath', dirPath);
      if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });

      const link = useMf
        ? await this.writeMfLink(previewDef.prefix, withPaths, templatePath, dirPath)
        : this.writeLink(previewDef.prefix, withPaths, templatePath, dirPath);
      return link;
    });

    return Promise.all(paths);
  }

  public createIndexEntryFile(bootstrapFileName: string, context: ExecutionContext, rootDir = this.tempFolder) {
    const dirName = join(rootDir, context.id);
    const contents = `import('./${bootstrapFileName}')`;
    const hash = objectHash(contents);
    const targetPath = join(dirName, `__index-${this.timestamp}.js`);
    console.log('createIndexEntryFile', targetPath);

    // write only if link has changed (prevents triggering fs watches)
    if (this.writeHash.get(targetPath) !== hash) {
      writeFileSync(targetPath, contents);
      this.writeHash.set(targetPath, hash);
    }
    return targetPath;
  }

  public createBootstrapFile(entryFilesPaths: string[], context: ExecutionContext, rootDir = this.tempFolder) {
    const contents = generateBootstrapFile(entryFilesPaths);
    const dirName = join(rootDir, context.id);
    const hash = objectHash(contents);
    const fileName = `__bootstrap-${this.timestamp}.js`;
    const targetPath = join(dirName, fileName);
    console.log('createBootstrapFile', targetPath);

    // write only if link has changed (prevents triggering fs watches)
    if (this.writeHash.get(targetPath) !== hash) {
      writeFileSync(targetPath, contents);
      this.writeHash.set(targetPath, hash);
    }
    return { bootstrapPath: targetPath, bootstrapFileName: fileName };
  }

  async writePreviewRuntime(context: { components: Component[] }, rootDir = this.tempFolder) {
    const ui = this.ui.getUi();
    if (!ui) throw new Error('ui not found');
    const [name, uiRoot] = ui;
    const resolvedAspects = await uiRoot.resolveAspects(PreviewRuntime.name);
    const filteredAspects = this.filterAspectsByExecutionContext(resolvedAspects, context);
    const filePath = await this.generateRootForMf(filteredAspects, name, 'preview', PreviewAspect.id, rootDir);
    console.log('filePath', filePath);
    return filePath;
  }

  /**
   * generate the root file of the UI runtime.
   */
  async generateRootForMf(
    aspectDefs: AspectDefinition[],
    rootExtensionName: string,
    runtimeName = PreviewRuntime.name,
    rootAspect = UIAspect.id,
    rootTempDir = this.tempFolder
  ) {
    // const rootRelativePath = `${runtimeName}.root${sha1(contents)}.js`;
    // const filepath = resolve(join(__dirname, rootRelativePath));
    const aspectsGroups = groupBy(aspectDefs, (def) => {
      const id = def.getId;
      if (!id) return 'host';
      if (this.aspectLoader.isCoreAspect(id)) return 'core';
      return 'host';
    });

    // const coreRootFilePath = this.writeCoreUiRoot(aspectsGroups.core, rootExtensionName, runtimeName, rootAspect);
    const { fullPath: coreRootFilePath } = this.writeCoreUiRoot(
      aspectsGroups.core,
      rootExtensionName,
      runtimeName,
      rootAspect
    );
    const hostRootFilePath = this.writeHostUIRoot(aspectsGroups.host, coreRootFilePath, runtimeName, rootTempDir);

    const rootBootstrapContents = await createRootBootstrap(hostRootFilePath.relativePath);
    const rootBootstrapRelativePath = `${runtimeName}.root${sha1(rootBootstrapContents)}-bootstrap.js`;
    const rootBootstrapPath = resolve(join(rootTempDir, rootBootstrapRelativePath));
    if (fs.existsSync(rootBootstrapPath)) return rootBootstrapPath;
    fs.outputFileSync(rootBootstrapPath, rootBootstrapContents);
    console.log('rootBootstrapPath', rootBootstrapPath);
    throw new Error('g');
    return rootBootstrapPath;
  }

  /**
   * Generate a file which contains all the core ui aspects and the harmony config to load them
   * This will get an harmony config, and host specific aspects to load
   * and load the harmony instance
   */
  private writeCoreUiRoot(
    coreAspects: AspectDefinition[],
    rootExtensionName: string,
    runtimeName = UIRuntime.name,
    rootAspect = UIAspect.id
  ) {
    const contents = createCoreRoot(coreAspects, rootExtensionName, rootAspect, runtimeName);
    const rootRelativePath = `${runtimeName}.core.root.${sha1(contents)}.js`;
    const filepath = resolve(join(__dirname, rootRelativePath));
    console.log('core ui root', filepath);
    if (fs.existsSync(filepath)) return { fullPath: filepath, relativePath: rootRelativePath };
    fs.outputFileSync(filepath, contents);
    return { fullPath: filepath, relativePath: rootRelativePath };
  }

  /**
   * Generate a file which contains host (workspace/scope) specific ui aspects. and the harmony config to load them
   */
  private writeHostUIRoot(
    hostAspects: AspectDefinition[] = [],
    coreRootPath: string,
    runtimeName = UIRuntime.name,
    rootTempDir = this.tempFolder
  ) {
    const contents = createHostRoot(hostAspects, coreRootPath, this.harmony.config.toObject());
    const rootRelativePath = `${runtimeName}.host.root.${sha1(contents)}.js`;
    const filepath = resolve(join(rootTempDir, rootRelativePath));
    console.log('host ui root', filepath);
    if (fs.existsSync(filepath)) return { fullPath: filepath, relativePath: rootRelativePath };
    fs.outputFileSync(filepath, contents);
    return { fullPath: filepath, relativePath: rootRelativePath };
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
    return [new EnvBundlingStrategy(this), new ComponentBundlingStrategy(), new EnvMfBundlingStrategy(this)];
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

  /**
   * return the configured bundling strategy.
   */
  getBundlingStrategy(strategyName = this.config.bundlingStrategy): BundlingStrategy {
    const defaultStrategies = this.getDefaultStrategies();
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

  async computeExposesFromExecutionContext(
    context: ExecutionContext
    // context: BuildContext
  ): Promise<Record<string, string>> {
    const defs = this.getDefs();
    const components = context.components;
    const compiler = context.envRuntime.env.getCompiler();
    const allExposes = {};
    const promises = components.map(async (component) => {
      const componentModulePath = this.workspace.componentModulePath(component);
      const exposes = await computeExposes(componentModulePath, defs, component, compiler);
      Object.assign(allExposes, exposes);
      return undefined;
    });
    await Promise.all(promises);

    return allExposes;
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
        exposes: preview.computeExposesFromExecutionContext.bind(preview),
      },
    ]);

    if (!config.disabled)
      builder.registerBuildTasks([new PreviewTask(bundler, preview), new GenerateEnvPreviewTask(envs, preview)]);

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
