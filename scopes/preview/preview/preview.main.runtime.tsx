import { Compiler } from '@teambit/compiler';
import { BuilderAspect, BuilderMain, BuildContext } from '@teambit/builder';
import { BundlerAspect, BundlerMain } from '@teambit/bundler';
import { PubsubAspect, PubsubMain } from '@teambit/pubsub';
import { MainRuntime } from '@teambit/cli';
import { Component, ComponentAspect, ComponentMain, ComponentMap, ComponentID } from '@teambit/component';
import { EnvsAspect, EnvsMain, ExecutionContext } from '@teambit/envs';
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
import { RuntimeComponents } from './runtime-components';
import { PreviewStartPlugin } from './preview.start-plugin';
import { computeExposes } from './compute-exposes';
import { generateBootstrapFile } from './generate-bootstrap-file';
import { EnvMfBundlingStrategy } from './strategies/env-mf-strategy';
import { GenerateEnvPreviewTask } from './bundle-env.task';

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

    private workspace?: Workspace
  ) {}

  get tempFolder(): string {
    return this.workspace?.getTempDir(PreviewAspect.id) || DEFAULT_TEMP_DIR;
  }

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

  private execContexts = new Map<string, ExecutionContext>();
  private componentsByAspect = new Map<string, RuntimeComponents>();

  // TODO: consolidate code duplication with the env-strategy computePaths logic
  private async getPreviewTarget(
    /** execution context (of the specific env) */
    context: ExecutionContext
  ): Promise<string[]> {
    // store context for later link file updates
    this.execContexts.set(context.id, context);
    this.componentsByAspect.set(context.id, new RuntimeComponents(context.components));

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
      const compilerInstance: Compiler = environment.getCompiler?.();
      const withPaths = map.map<string[]>((files, component) => {
        const modulePath = this.pkg.getModulePath(component);
        return files.map((file) => {
          if (!this.workspace) {
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

  async writePreviewRuntime(context: { components: Component[] }) {
    const ui = this.ui.getUi();
    if (!ui) throw new Error('ui not found');
    const [name, uiRoot] = ui;
    const resolvedAspects = await uiRoot.resolveAspects(PreviewRuntime.name);
    const filteredAspects = this.filterAspectsByExecutionContext(resolvedAspects, context);
    const filePath = await this.ui.generateRoot(filteredAspects, name, 'preview', PreviewAspect.id);
    console.log('filePath', filePath);
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
    return [new EnvBundlingStrategy(this), new ComponentBundlingStrategy(), new EnvMfBundlingStrategy(this)];
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
  ];

  static defaultConfig = {
    bundlingStrategy: 'env',
    disabled: false,
  };

  static async provider(
    [bundler, builder, componentExtension, uiMain, envs, workspace, pkg, pubsub, aspectLoader]: [
      BundlerMain,
      BuilderMain,
      ComponentMain,
      UiMain,
      EnvsMain,
      Workspace | undefined,
      PkgMain,
      PubsubMain,
      AspectLoaderMain
    ],
    config: PreviewConfig,
    [previewSlot, bundlingStrategySlot]: [PreviewDefinitionRegistry, BundlingStrategySlot],
    harmony: Harmony
  ) {
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
      workspace
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
