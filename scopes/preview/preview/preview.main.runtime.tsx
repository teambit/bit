import { ArtifactFactory, BuilderAspect } from '@teambit/builder';
import type { BuilderMain } from '@teambit/builder';
import { Asset, BundlerAspect, BundlerMain } from '@teambit/bundler';
import { PubsubAspect, PubsubMain } from '@teambit/pubsub';
import { MainRuntime } from '@teambit/cli';
import {
  Component,
  ComponentAspect,
  ComponentMain,
  ComponentMap,
  ComponentID,
  ResolveAspectsOptions,
} from '@teambit/component';
import { EnvsAspect } from '@teambit/envs';
import type { EnvsMain, ExecutionContext, PreviewEnv } from '@teambit/envs';
import { Slot, SlotRegistry, Harmony } from '@teambit/harmony';
import { UIAspect, UiMain, UIRoot } from '@teambit/ui';
import { CacheAspect, CacheMain } from '@teambit/cache';
import { CACHE_ROOT } from '@teambit/legacy/dist/constants';
import { BitError } from '@teambit/bit-error';
import objectHash from 'object-hash';
import { uniq } from 'lodash';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs-extra';
import { join } from 'path';
import { PkgAspect, PkgMain } from '@teambit/pkg';
import { AspectLoaderAspect, getAspectDir, getAspectDirFromBvm } from '@teambit/aspect-loader';
import type { AspectDefinition, AspectLoaderMain } from '@teambit/aspect-loader';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { LoggerAspect, LoggerMain, Logger } from '@teambit/logger';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { ArtifactFiles } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import WatcherAspect, { WatcherMain } from '@teambit/watcher';
import GraphqlAspect, { GraphqlMain } from '@teambit/graphql';
import { BundlingStrategyNotFound } from './exceptions';
import { generateLink, MainModulesMap } from './generate-link';
import { PreviewArtifact } from './preview-artifact';
import { PreviewDefinition } from './preview-definition';
import { PreviewAspect, PreviewRuntime } from './preview.aspect';
import { PreviewRoute } from './preview.route';
import { PreviewTask, PREVIEW_TASK_NAME } from './preview.task';
import { BundlingStrategy } from './bundling-strategy';
import {
  EnvBundlingStrategy,
  ComponentBundlingStrategy,
  COMPONENT_STRATEGY_ARTIFACT_NAME,
  COMPONENT_STRATEGY_SIZE_KEY_NAME,
  ENV_PREVIEW_STRATEGY_NAME,
  ENV_STRATEGY_ARTIFACT_NAME,
  COMPONENT_PREVIEW_STRATEGY_NAME,
} from './strategies';
import { ExecutionRef } from './execution-ref';
import { PreviewStartPlugin } from './preview.start-plugin';
import {
  EnvPreviewTemplateTask,
  GENERATE_ENV_TEMPLATE_TASK_NAME,
  getArtifactDef as getEnvTemplateArtifactDef,
} from './env-preview-template.task';
import { EnvTemplateRoute } from './env-template.route';
import { ComponentPreviewRoute } from './component-preview.route';
import { previewSchema } from './preview.graphql';
import { PreviewAssetsRoute } from './preview-assets.route';
import { PreviewService } from './preview.service';
import { buildPreBundlePreview, generateBundlePreviewEntry } from './pre-bundle';
import { createBundleHash, getBundlePath, readBundleHash } from './pre-bundle-utils';
import { PreBundlePreviewTask } from './pre-bundle.task';

const noopResult = {
  results: [],
  toString: () => `updating link file`,
};

const DEFAULT_TEMP_DIR = join(CACHE_ROOT, PreviewAspect.id);

export type PreviewDefinitionRegistry = SlotRegistry<PreviewDefinition>;

export type PreviewStrategyName = 'env' | 'component';

export type PreviewFiles = {
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

export type PreviewVariantConfig = {
  isScaling?: boolean;
};

/**
 * Preview data that stored on the component on load
 */
export type PreviewComponentData = PreviewAnyComponentData & PreviewEnvComponentData;

/**
 * Preview data that stored on the component on load for any component
 */
export type PreviewAnyComponentData = {
  doesScaling?: boolean;
  /**
   * The strategy configured by the component's env
   */
  strategyName?: PreviewStrategyName;
  /**
   * Does the component has a bundle for the component itself (separated from the compositions/docs)
   * Calculated by the component's env
   */
  splitComponentBundle?: boolean;

  /**
   * don't allow other aspects implementing a preview definition to be included in your preview.
   */
  skipIncludes?: boolean;
};

/**
 * Preview data that stored on the component on load if the component is an env
 */
export type PreviewEnvComponentData = {
  isScaling?: boolean;
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
  strategyName?: PreviewStrategyName;
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

    private cache: CacheMain,

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
    const artifacts = await this.builder.getArtifactsVinylByAspectAndTaskName(
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
   * Get the preview config of the component.
   * (config that was set by variants or on bitmap)
   * @param component
   * @returns
   */
  getPreviewAspectConfig(component: Component): PreviewVariantConfig | undefined {
    return component.state.aspects.get(PreviewAspect.id)?.config;
  }

  /**
   * Get the preview data of the component.
   * (data that was calculated during the on load process)
   * @param component
   * @returns
   */
  getPreviewData(component: Component): PreviewComponentData | undefined {
    const previewData = component.state.aspects.get(PreviewAspect.id)?.data;
    return previewData;
  }

  /**
   * Calculate preview data on component load
   * @param component
   * @returns
   */
  async calcPreviewData(component: Component): Promise<PreviewComponentData> {
    const doesScaling = await this.calcDoesScalingForComponent(component);
    const dataFromEnv = await this.calcPreviewDataFromEnv(component);
    const envData = (await this.calculateDataForEnvComponent(component)) || {};
    const data: PreviewComponentData = {
      doesScaling,
      ...dataFromEnv,
      ...envData,
    };
    return data;
  }

  /**
   * Calculate preview data on component that configured by its env
   * @param component
   * @returns
   */
  async calcPreviewDataFromEnv(
    component: Component
  ): Promise<Omit<PreviewAnyComponentData, 'doesScaling'> | undefined> {
    // Prevent infinite loop that caused by the fact that the env of the aspect env or the env env is the same as the component
    // so we can't load it since during load we are trying to get env component and load it again
    if (
      component.id.toStringWithoutVersion() === 'teambit.harmony/aspect' ||
      component.id.toStringWithoutVersion() === 'teambit.envs/env'
    ) {
      return {
        strategyName: COMPONENT_PREVIEW_STRATEGY_NAME,
        splitComponentBundle: false,
      };
    }

    const env = this.envs.getEnv(component).env;
    const envPreviewConfig = this.getEnvPreviewConfig(env);
    const data = {
      strategyName: envPreviewConfig?.strategyName,
      splitComponentBundle: envPreviewConfig?.splitComponentBundle ?? false,
    };
    return data;
  }

  /**
   * calculate extra preview data for env components (on load)
   * @param envComponent
   * @returns
   */
  private async calculateDataForEnvComponent(envComponent: Component): Promise<PreviewEnvComponentData | undefined> {
    const isEnv = this.envs.isEnv(envComponent);
    // If the component is not an env, we don't want to store anything in the data
    if (!isEnv) return undefined;
    const previewAspectConfig = this.getPreviewAspectConfig(envComponent);

    const data = {
      // default to true if the env doesn't have a preview config
      isScaling: previewAspectConfig?.isScaling ?? true,
      // disalbe it for now, we will re-enable it later
      // skipIncludes: true,
    };
    return data;
  }

  /**
   * Check if the component preview bundle contain the env as part of the bundle or only the component code
   * (we used in the past to bundle them together, there might also be specific envs which still uses the env strategy)
   * This should be used only for calculating the value on load.
   * otherwise, use the isBundledWithEnv function
   * @param component
   * @returns
   */
  async calcIsBundledWithEnv(component: Component): Promise<boolean> {
    const envPreviewData = await this.calcPreviewDataFromEnv(component);
    return envPreviewData?.strategyName !== 'component';
  }

  /**
   * Check if the component preview bundle contain the env as part of the bundle or only the component code
   * (we used in the past to bundle them together, there might also be specific envs which still uses the env strategy)
   * @param component
   * @returns
   */
  async isBundledWithEnv(component: Component): Promise<boolean> {
    const data = await this.getPreviewData(component);
    // For components that tagged in the past we didn't store the data, so we calculate it the old way
    // We comparing the strategyName to undefined to cover a specific case when it doesn't exist at all.
    if (!data || data.strategyName === undefined) return this.isBundledWithEnvBackward(component);
    return data.strategyName === ENV_PREVIEW_STRATEGY_NAME;
  }

  /**
   * This is a legacy calculation for the isBundledWithEnv
   * This calc is based on the component artifacts which is very expensive operation as it requires to fetch and load the artifacts
   * See the new implementation in the isBundledWithEnv method
   * @param component
   * @returns
   */
  private async isBundledWithEnvBackward(component: Component): Promise<boolean> {
    const artifacts = await this.builder.getArtifactsVinylByAspectAndName(
      component,
      PreviewAspect.id,
      COMPONENT_STRATEGY_ARTIFACT_NAME
    );
    if (!artifacts || !artifacts.length) return true;

    return false;
  }

  // This used on component load to calc the final result of support is scaling for a given component
  // This calc based on the env, env data, env preview config and more
  // if you want to get the final result use the `doesScaling` method below
  // This should be used only for component load
  private async calcDoesScalingForComponent(component: Component): Promise<boolean> {
    const isBundledWithEnv = await this.calcIsBundledWithEnv(component);
    // if it's a core env and the env template is apart from the component it means the template bundle already contain the scaling functionality
    if (this.envs.isUsingCoreEnv(component)) {
      // If the component is new, no point to check the is bundle with env (there is no artifacts so it will for sure return false)
      // If it's new, and we are here, it means that we already use a version of the env that support scaling
      const isNew = await component.isNew();
      if (isNew) {
        return true;
      }
      return isBundledWithEnv === false;
    }
    // For envs that bundled with the env return true always
    if (isBundledWithEnv) {
      return true;
    }
    const envComponent = await this.envs.getEnvComponent(component);
    return this.isEnvSupportScaling(envComponent);
  }

  /**
   * can the current component preview scale in size for different preview sizes.
   * this calculation is based on the env of the component and if the env of the component support it.
   */
  async doesScaling(component: Component): Promise<boolean> {
    const inWorkspace = await this.workspace?.hasId(component.id);
    // Support case when we have the dev server for the env, in that case we calc the data of the env as we can't rely on the env data from the scope
    // since we bundle it for the dev server again
    if (inWorkspace) {
      // if it's a core env and the env template is apart from the component it means the template bundle already contain the scaling functionality
      if (this.envs.isUsingCoreEnv(component)) {
        const isBundledWithEnv = await this.isBundledWithEnv(component);
        // If the component is new, no point to check the is bundle with env (there is no artifacts so it will for sure return false)
        // If it's new, and we are here, it means that we already use a version of the env that support scaling
        const isNew = await component.isNew();
        if (isNew) {
          return true;
        }
        return isBundledWithEnv === false;
      }
      const envComponent = await this.envs.getEnvComponent(component);
      const envSupportScaling = await this.calculateIsEnvSupportScaling(envComponent);
      return envSupportScaling ?? true;
    }
    const previewData = this.getPreviewData(component);
    if (!previewData) return false;
    // Get the does scaling (the new calculation) or the old calc used in isScaling (between versions (about) 848 and 860)
    if (previewData.doesScaling !== undefined) return previewData.doesScaling;
    // in case this component were tagged with versions between 848 and 860 we need to use the old calculation
    // together with the env calculation
    // In that case it means the component already tagged, so we take the env calc from the env data and not re-calc it
    if (previewData.isScaling) {
      const envComponent = await this.envs.getEnvComponent(component);
      const envSupportScaling = this.isEnvSupportScaling(envComponent);
      return !!envSupportScaling;
    }
    return false;
  }

  /**
   * Check if the current version of the env support scaling
   * @param envComponent
   * @returns
   */
  isEnvSupportScaling(envComponent: Component): boolean {
    const previewData = this.getPreviewData(envComponent);
    return !!previewData?.isScaling;
  }

  async isSupportSkipIncludes(component: Component) {
    const isCore = this.envs.isUsingCoreEnv(component);
    if (isCore) return false;

    const envComponent = await this.envs.getEnvComponent(component);
    const previewData = this.getPreviewData(envComponent);
    return !!previewData?.skipIncludes;
  }

  /**
   * This function is calculate the isScaling support flag for the component preview.
   * This is calculated only for the env component and not for the component itself.
   * It should be only used during the (env) component on load.
   * Once the component load, you should only use the `isEnvSupportScaling` to fetch it from the calculated data.
   * If you want to check if an env for a given component support scaling, use the `isScaling` function.
   * @param component
   * @returns
   */
  private async calculateIsEnvSupportScaling(envComponent: Component): Promise<boolean | undefined> {
    const isEnv = this.envs.isEnv(envComponent);
    // If the component is not an env, we don't want to store anything in the data
    if (!isEnv) return undefined;
    const previewAspectConfig = this.getPreviewAspectConfig(envComponent);
    // default to true if the env doesn't have a preview config
    return previewAspectConfig?.isScaling ?? true;
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

    const artifacts = await this.builder.getArtifactsVinylByAspectAndName(
      component,
      PreviewAspect.id,
      ENV_STRATEGY_ARTIFACT_NAME
    );
    const envType = this.envs.getEnvData(component).type;
    return !!artifacts && !!artifacts.length && ENV_WITH_LEGACY_DOCS.includes(envType || '');
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
    const artifacts = await this.builder.getArtifactsVinylByAspectAndTaskName(
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
    mainModulesMap: MainModulesMap,
    dirName: string,
    isSplitComponentBundle: boolean
  ) {
    const contents = generateLink(prefix, moduleMap, mainModulesMap, isSplitComponentBundle);
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

    // const previewRuntime = await this.writePreviewRuntime(context);
    const previewRuntime = await this.writePreviewEntry(context);
    const linkFiles = await this.updateLinkFiles(context.components, context);

    return [...linkFiles, previewRuntime];
  }

  private async writePreviewEntry(context: { components: Component[] }, aspectsIdsToNotFilterOut: string[] = []) {
    const { rebuild, skipUiBuild } = this.ui.runtimeOptions;

    const [name, uiRoot] = this.getUi();
    const currentBundleHash = await createBundleHash(uiRoot, 'preview');
    const preBundleHash = readBundleHash(PreviewAspect.id, 'pre-bundle-preview', '');
    const workspaceBundleDir = join(uiRoot.path, 'public/bit-preview');
    const lastBundleHash = await this.cache.get(`${uiRoot.path}|preview`);
    // eslint-disable-next-line no-console
    console.log({
      rebuild,
      skipUiBuild,
      currentBundleHash,
      lastBundleHash,
      preBundleHash,
      workspaceBundleDir,
    });

    let bundlePath = '';

    if (!rebuild && !existsSync(workspaceBundleDir) && (currentBundleHash === preBundleHash || skipUiBuild)) {
      // use pre-bundle
      // eslint-disable-next-line no-console
      console.log('\n[use pre bundle]');
      bundlePath = getBundlePath(PreviewAspect.id, 'pre-bundle-preview', '') as string;
    } else if (!rebuild && existsSync(workspaceBundleDir) && (currentBundleHash === lastBundleHash || skipUiBuild)) {
      // use workspace bundle
      // eslint-disable-next-line no-console
      console.log('\n[use workspace bundle]');
      bundlePath = workspaceBundleDir;
    } else {
      // do build
      // eslint-disable-next-line no-console
      console.log('\n[do build]');
      const resolvedAspects = await this.resolveAspects(PreviewRuntime.name, undefined, uiRoot);
      const filteredAspects = this.filterAspectsByExecutionContext(resolvedAspects, context, aspectsIdsToNotFilterOut);

      await buildPreBundlePreview(filteredAspects);
      bundlePath = workspaceBundleDir;
      await this.cache.set(`${uiRoot.path}|preview`, currentBundleHash);
    }

    const previewRuntime = await generateBundlePreviewEntry(
      name,
      bundlePath,
      // harmonyConfig
      this.harmony.config.toObject()
    );
    // eslint-disable-next-line no-console
    console.log('\n[writePreviewEntry]', {
      bundlePath,
      uiPath: uiRoot.path,
      previewRuntime,
    });
    return previewRuntime;
  }

  private updateLinkFiles(components: Component[] = [], context: ExecutionContext) {
    const previews = this.previewSlot.values();
    const paths = previews.map(async (previewDef) => {
      const defaultTemplatePath = await previewDef.renderTemplatePathByEnv?.(context.env);
      const visitedEnvs = new Set();
      const mainModulesMap: MainModulesMap = {
        // @ts-ignore
        default: defaultTemplatePath,
        [context.envDefinition.id]: defaultTemplatePath,
      };

      const map = await previewDef.getModuleMap(components);
      const isSplitComponentBundle = this.getEnvPreviewConfig().splitComponentBundle ?? false;
      const withPathsP = map.asyncMap(async (files, component) => {
        const envDef = this.envs.getEnv(component);
        const environment = envDef.env;
        const envId = envDef.id;

        if (!mainModulesMap[envId] && !visitedEnvs.has(envId)) {
          const modulePath = await previewDef.renderTemplatePathByEnv?.(envDef.env);
          if (modulePath) {
            mainModulesMap[envId] = modulePath;
          }
          visitedEnvs.add(envId);
        }
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
      const withPaths = await withPathsP;

      const dirPath = join(this.tempFolder, context.id);
      if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });

      const link = this.writeLink(previewDef.prefix, withPaths, mainModulesMap, dirPath, isSplitComponentBundle);
      return link;
    });

    return Promise.all(paths);
  }

  async writePreviewRuntime(context: { components: Component[] }, aspectsIdsToNotFilterOut: string[] = []) {
    const [name, uiRoot] = this.getUi();
    const resolvedAspects = await this.resolveAspects(PreviewRuntime.name, undefined, uiRoot);
    const filteredAspects = this.filterAspectsByExecutionContext(resolvedAspects, context, aspectsIdsToNotFilterOut);
    const filePath = await this.ui.generateRoot(filteredAspects, name, 'preview', PreviewAspect.id);
    // eslint-disable-next-line no-console
    console.log('\n[writePreviewRuntime 3]', {
      name,
      runtimeName: 'preview',
      previewAspectId: PreviewAspect.id,
      filePath,
    });
    try {
      const contents = readFileSync(filePath, 'utf-8');
      // eslint-disable-next-line no-console
      console.log(contents);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log({ e });
    }
    // eslint-disable-next-line no-console
    console.log('[over]');
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
    CacheAspect,
    EnvsAspect,
    WorkspaceAspect,
    PkgAspect,
    PubsubAspect,
    AspectLoaderAspect,
    LoggerAspect,
    DependencyResolverAspect,
    GraphqlAspect,
    WatcherAspect,
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
      cache,
      envs,
      workspace,
      pkg,
      pubsub,
      aspectLoader,
      loggerMain,
      dependencyResolver,
      graphql,
      watcher,
    ]: [
      BundlerMain,
      BuilderMain,
      ComponentMain,
      UiMain,
      CacheMain,
      EnvsMain,
      Workspace | undefined,
      PkgMain,
      PubsubMain,
      AspectLoaderMain,
      LoggerMain,
      DependencyResolverMain,
      GraphqlMain,
      WatcherMain
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
      cache,
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

    if (workspace)
      uiMain.registerStartPlugin(new PreviewStartPlugin(workspace, bundler, uiMain, pubsub, logger, watcher));

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

    builder.registerBuildTasks([new PreBundlePreviewTask(uiMain, logger)]);

    if (!config.disabled)
      builder.registerBuildTasks([
        new EnvPreviewTemplateTask(preview, envs, aspectLoader, dependencyResolver, logger),
        new PreviewTask(bundler, preview, dependencyResolver, logger),
      ]);

    if (workspace) {
      workspace.registerOnComponentAdd((c) =>
        preview.handleComponentChange(c, (currentComponents) => currentComponents.add(c))
      );
      workspace.onComponentLoad(async (component) => {
        return preview.calcPreviewData(component);
      });
      workspace.registerOnComponentChange((c) =>
        preview.handleComponentChange(c, (currentComponents) => currentComponents.update(c))
      );
      workspace.registerOnComponentRemove((cId) => preview.handleComponentRemoval(cId));
    }

    envs.registerService(new PreviewService());

    graphql.register(previewSchema(preview));

    return preview;
  }
}

PreviewAspect.addRuntime(PreviewMain);
