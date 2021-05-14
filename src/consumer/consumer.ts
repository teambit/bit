import fs from 'fs-extra';
import mapSeries from 'p-map-series';
import * as path from 'path';
import R from 'ramda';
import semver from 'semver';
import { IssuesClasses } from '@teambit/component-issues';
import { Analytics } from '../analytics/analytics';
import { BitId, BitIds } from '../bit-id';
import { BitIdStr } from '../bit-id/bit-id';
import loader from '../cli/loader';
import { BEFORE_MIGRATION } from '../cli/loader/loader-messages';
import {
  BIT_GIT_DIR,
  BIT_HIDDEN_DIR,
  BIT_WORKSPACE_TMP_DIRNAME,
  COMPILER_ENV_TYPE,
  COMPONENT_ORIGINS,
  DEFAULT_LANE,
  DEPENDENCIES_FIELDS,
  DOT_GIT_DIR,
  LATEST,
  TESTER_ENV_TYPE,
} from '../constants';
import GeneralError from '../error/general-error';
import { LocalLaneId } from '../lane-id/lane-id';
import CompilerExtension from '../legacy-extensions/compiler-extension';
import EnvExtension from '../legacy-extensions/env-extension';
import { EnvType } from '../legacy-extensions/env-extension-types';
import makeEnv from '../legacy-extensions/env-factory';
import TesterExtension from '../legacy-extensions/tester-extension';
import logger from '../logger/logger';
import { Remotes } from '../remotes';
import { ComponentWithDependencies, Scope } from '../scope';
import { AutoTagResult, getAutoTagPending } from '../scope/component-ops/auto-tag';
import ScopeComponentsImporter from '../scope/component-ops/scope-components-importer';
import tagModelComponent from '../scope/component-ops/tag-model-component';
import { ComponentNotFound } from '../scope/exceptions';
import installExtensions from '../scope/extensions/install-extensions';
import { Lane, ModelComponent, Version } from '../scope/models';
import { getScopeRemotes } from '../scope/scope-remotes';
import VersionDependencies, { multipleVersionDependenciesToConsumer } from '../scope/version-dependencies';
import { pathNormalizeToLinux, sortObject } from '../utils';
import getNodeModulesPathOfComponent from '../utils/bit/component-node-modules-path';
import { composeComponentPath, composeDependencyPath } from '../utils/bit/compose-component-path';
import { packageNameToComponentId } from '../utils/bit/package-name-to-component-id';
import { PathAbsolute, PathOsBased, PathOsBasedAbsolute, PathOsBasedRelative, PathRelative } from '../utils/path';
import BitMap, { CURRENT_BITMAP_SCHEMA } from './bit-map/bit-map';
import ComponentMap from './bit-map/component-map';
import Component from './component';
import { ComponentStatus, ComponentStatusLoader, ComponentStatusResult } from './component-ops/component-status-loader';
import ComponentsPendingImport from './component-ops/exceptions/components-pending-import';
import {
  getManipulateDirForExistingComponents,
  getManipulateDirWhenImportingComponents,
} from './component-ops/manipulate-dir';
import ComponentLoader from './component/component-loader';
import { InvalidComponent } from './component/consumer-component';
import { Dependencies } from './component/dependencies';
import { FailedLoadForTag } from './component/exceptions/failed-load-for-tag';
import PackageJsonFile from './component/package-json-file';
import * as packageJsonUtils from './component/package-json-utils';
import { ILegacyWorkspaceConfig } from './config';
import WorkspaceConfig, { WorkspaceConfigProps } from './config/workspace-config';
import { getConsumerInfo } from './consumer-locator';
import DirStructure from './dir-structure/dir-structure';
import { ConsumerNotFound, MissingDependencies } from './exceptions';
import migrate, { ConsumerMigrationResult } from './migrations/consumer-migrator';
import migratonManifest from './migrations/consumer-migrator-manifest';
import { BasicTagParams } from '../api/consumer/lib/tag';
import { UnexpectedPackageName } from './exceptions/unexpected-package-name';

type ConsumerProps = {
  projectPath: string;
  config: ILegacyWorkspaceConfig;
  scope: Scope;
  created?: boolean;
  isolated?: boolean;
  addedGitHooks?: string[] | undefined;
  existingGitHooks: string[] | undefined;
};

/**
 * @todo: change the class name to Workspace
 */
export default class Consumer {
  projectPath: PathOsBased;
  created: boolean;
  config: ILegacyWorkspaceConfig;
  scope: Scope;
  bitMap: BitMap;
  isolated = false; // Mark that the consumer instance is of isolated env and not real
  addedGitHooks: string[] | undefined; // list of git hooks added during init process
  existingGitHooks: string[] | undefined; // list of git hooks already exists during init process
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  _dirStructure: DirStructure;
  _componentsStatusCache: Record<string, any> = {}; // cache loaded components
  packageManagerArgs: string[] = []; // args entered by the user in the command line after '--'
  componentLoader: ComponentLoader;
  componentStatusLoader: ComponentStatusLoader;
  packageJson: any;
  public onCacheClear: Array<() => void> = [];
  constructor({
    projectPath,
    config,
    scope,
    created = false,
    isolated = false,
    addedGitHooks,
    existingGitHooks,
  }: ConsumerProps) {
    this.projectPath = projectPath;
    this.config = config;
    this.created = created;
    this.isolated = isolated;
    this.scope = scope;
    this.addedGitHooks = addedGitHooks;
    this.existingGitHooks = existingGitHooks;
    this.componentLoader = ComponentLoader.getInstance(this);
    this.componentStatusLoader = new ComponentStatusLoader(this);
    this.packageJson = PackageJsonFile.loadSync(projectPath);
  }
  async setBitMap() {
    this.bitMap = await BitMap.load(this);
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get compiler(): Promise<CompilerExtension | undefined> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.getEnv(COMPILER_ENV_TYPE);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get tester(): Promise<TesterExtension | undefined> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.getEnv(TESTER_ENV_TYPE);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get dirStructure(): DirStructure {
    if (!this._dirStructure) {
      this._dirStructure = new DirStructure(this.config.componentsDefaultDirectory, this.config._dependenciesDirectory);
    }
    return this._dirStructure;
  }

  get componentFsCache() {
    return this.componentLoader.componentFsCache;
  }

  get bitmapIdsFromCurrentLane(): BitIds {
    return this.bitMap.getAllIdsAvailableOnLane();
  }

  get bitMapIdsFromAllLanes(): BitIds {
    return this.bitMap.getAllBitIdsFromAllLanes();
  }

  clearCache() {
    this.componentLoader.clearComponentsCache();
    this.onCacheClear.forEach((func) => func());
  }

  async getEnv(envType: EnvType, context: Record<string, any> | undefined): Promise<EnvExtension | undefined> {
    const props = this._getEnvProps(envType, context);
    if (!props) return undefined;
    return makeEnv(envType, props);
  }

  getTmpFolder(fullPath = false): PathOsBased {
    if (!fullPath) {
      return BIT_WORKSPACE_TMP_DIRNAME;
    }
    return path.join(this.getPath(), BIT_WORKSPACE_TMP_DIRNAME);
  }

  getCurrentLaneId(): LocalLaneId {
    return LocalLaneId.from(this.scope.lanes.getCurrentLaneName() || DEFAULT_LANE);
  }

  async getCurrentLaneObject(): Promise<Lane | null> {
    return this.scope.lanes.getCurrentLaneObject();
  }

  async cleanTmpFolder() {
    const tmpPath = this.getTmpFolder(true);
    const exists = await fs.pathExists(tmpPath);
    if (exists) {
      logger.info(`consumer.cleanTmpFolder, deleting ${tmpPath}`);
      return fs.remove(tmpPath);
    }
    return undefined;
  }

  /**
   * Running migration process for consumer to update the stores (.bit.map.json) to the current version
   *
   * @param {any} verbose - print debug logs
   * @returns {Object} - wether the process run and wether it successeded
   * @memberof Consumer
   */
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  async migrate(verbose): Record<string, any> {
    // Check version of stores (bitmap / bitjson) to check if we need to run migrate
    // If migration is needed add loader - loader.start(BEFORE_MIGRATION);
    // bitmap migrate
    if (verbose) console.log('running migration process for consumer'); // eslint-disable-line
    const bitmapSchema = this.bitMap.schema;
    if (semver.gte(bitmapSchema, CURRENT_BITMAP_SCHEMA)) {
      logger.trace('bit.map version is up to date');
      return {
        run: false,
      };
    }
    loader.start(BEFORE_MIGRATION);
    logger.debugAndAddBreadCrumb(
      'consumer.migrate',
      `start consumer migration. bitmapSchema ${bitmapSchema}, current schema ${CURRENT_BITMAP_SCHEMA}`
    );

    const result: ConsumerMigrationResult = await migrate(bitmapSchema, migratonManifest, this.bitMap, verbose);
    result.bitMap.schema = CURRENT_BITMAP_SCHEMA;
    // mark the bitmap as changed to make sure it persist to FS
    result.bitMap.markAsChanged();
    // Update the version of the bitmap instance of the consumer (to prevent duplicate migration)
    this.bitMap.schema = result.bitMap.schema;
    await result.bitMap.write(this.componentFsCache);

    loader.stop();

    return {
      run: true,
      success: true,
    };
  }

  async write(): Promise<Consumer> {
    await Promise.all([this.config.write({ workspaceDir: this.projectPath }), this.scope.ensureDir()]);
    this.bitMap.markAsChanged();
    await this.writeBitMap();
    return this;
  }

  getPath(): PathOsBased {
    return this.projectPath;
  }

  toAbsolutePath(pathStr: PathRelative): PathOsBasedAbsolute {
    if (path.isAbsolute(pathStr)) throw new Error(`toAbsolutePath expects relative path, got ${pathStr}`);
    return path.join(this.projectPath, pathStr);
  }

  getPathRelativeToConsumer(pathToCheck: PathRelative | PathAbsolute): PathOsBasedRelative {
    const absolutePath = path.resolve(pathToCheck); // if pathToCheck was absolute, it returns it back
    return path.relative(this.getPath(), absolutePath);
  }

  getParsedId(id: BitIdStr, useVersionFromBitmap = false, searchWithoutScopeInProvidedId = false): BitId {
    if (id.startsWith('@')) {
      throw new UnexpectedPackageName(id);
    }
    // @ts-ignore (we know it will never be undefined since it pass throw=true)
    const bitId: BitId = this.bitMap.getExistingBitId(id, true, searchWithoutScopeInProvidedId);
    if (!useVersionFromBitmap) {
      const version = BitId.getVersionOnlyFromString(id);
      return bitId.changeVersion(version || LATEST);
    }
    return bitId;
  }

  getParsedIdIfExist(
    id: BitIdStr,
    useVersionFromBitmap = false,
    searchWithoutScopeInProvidedId = false
  ): BitId | undefined {
    const bitId: BitId | undefined = this.bitMap.getExistingBitId(id, false, searchWithoutScopeInProvidedId);
    if (!bitId) return undefined;
    if (!useVersionFromBitmap) {
      const version = BitId.getVersionOnlyFromString(id);
      return bitId.changeVersion(version || LATEST);
    }
    return bitId;
  }

  /**
   * throws a ComponentNotFound exception if not found in the model
   */
  async loadComponentFromModel(id: BitId): Promise<Component> {
    if (!id.version) throw new TypeError('consumer.loadComponentFromModel, version is missing from the id');
    const modelComponent: ModelComponent = await this.scope.getModelComponent(id);

    const componentVersion = modelComponent.toComponentVersion(id.version);
    const manipulateDirData = await getManipulateDirForExistingComponents(this, componentVersion);
    return modelComponent.toConsumerComponent(id.version, this.scope.name, this.scope.objects, manipulateDirData);
  }

  /**
   * return a component only when it's stored locally.
   * don't go to any remote server and don't throw an exception if the component is not there.
   */
  async loadComponentFromModelIfExist(id: BitId): Promise<Component | undefined> {
    if (!id.version) return undefined;
    return this.loadComponentFromModel(id).catch((err) => {
      if (err instanceof ComponentNotFound) return undefined;
      throw err;
    });
  }

  async loadAllVersionsOfComponentFromModel(id: BitId): Promise<Component[]> {
    const modelComponent: ModelComponent = await this.scope.getModelComponent(id);
    const componentsP = modelComponent.listVersions().map(async (versionNum) => {
      const componentVersion = modelComponent.toComponentVersion(versionNum);
      const manipulateDirData = await getManipulateDirForExistingComponents(this, componentVersion);
      return modelComponent.toConsumerComponent(versionNum, this.scope.name, this.scope.objects, manipulateDirData);
    });
    return Promise.all(componentsP);
  }

  async loadComponentWithDependenciesFromModel(id: BitId, throwIfNotExist = true): Promise<ComponentWithDependencies> {
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(this.scope);
    const getModelComponent = async (): Promise<ModelComponent> => {
      if (throwIfNotExist) return this.scope.getModelComponent(id);
      const modelComponent = await this.scope.getModelComponentIfExist(id);
      if (modelComponent) return modelComponent;
      await scopeComponentsImporter.importMany(new BitIds(id));
      return this.scope.getModelComponent(id);
    };
    const modelComponent = await getModelComponent();
    if (!id.version) {
      throw new TypeError('consumer.loadComponentWithDependenciesFromModel, version is missing from the id');
    }

    const versionDependencies = (await scopeComponentsImporter.componentToVersionDependencies(
      modelComponent,
      id
    )) as VersionDependencies;
    const manipulateDirData = await getManipulateDirWhenImportingComponents(
      this.bitMap,
      [versionDependencies],
      this.scope.objects
    );
    return versionDependencies.toConsumer(this.scope.objects, manipulateDirData);
  }

  async loadComponent(id: BitId): Promise<Component> {
    const { components } = await this.loadComponents(BitIds.fromArray([id]));
    return components[0];
  }

  loadComponentForCapsule(id: BitId): Promise<Component> {
    return this.componentLoader.loadForCapsule(id);
  }

  async loadComponents(
    ids: BitIds,
    throwOnFailure = true
  ): Promise<{ components: Component[]; invalidComponents: InvalidComponent[] }> {
    return this.componentLoader.loadMany(ids, throwOnFailure);
  }

  importEnvironment(bitId: BitId, verbose = false, dontPrintEnvMsg: boolean): Promise<ComponentWithDependencies[]> {
    return installExtensions({ ids: [{ componentId: bitId }], scope: this.scope, verbose, dontPrintEnvMsg });
  }

  async importComponents(
    ids: BitIds,
    withAllVersions: boolean,
    saveDependenciesAsComponents?: boolean
  ): Promise<ComponentWithDependencies[]> {
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(this.scope);
    const versionDependenciesArr: VersionDependencies[] = withAllVersions
      ? await scopeComponentsImporter.importManyWithAllVersions(ids, false)
      : await scopeComponentsImporter.importMany(ids);
    const shouldDependenciesSavedAsComponents = await this.shouldDependenciesSavedAsComponents(
      versionDependenciesArr.map((v) => v.component.id),
      saveDependenciesAsComponents
    );
    const manipulateDirData = await getManipulateDirWhenImportingComponents(
      this.bitMap,
      versionDependenciesArr,
      this.scope.objects
    );
    const componentWithDependencies = await mapSeries(versionDependenciesArr, (versionDependencies) =>
      versionDependencies.toConsumer(this.scope.objects, manipulateDirData)
    );
    componentWithDependencies.forEach((componentWithDeps) => {
      const shouldSavedAsComponents = shouldDependenciesSavedAsComponents.find((c) =>
        c.id.isEqual(componentWithDeps.component.id)
      );
      if (!shouldSavedAsComponents) {
        throw new Error(`saveDependenciesAsComponents is missing for ${componentWithDeps.component.id.toString()}`);
      }
      componentWithDeps.component.dependenciesSavedAsComponents = shouldSavedAsComponents.saveDependenciesAsComponents;
    });
    return componentWithDependencies;
  }

  async importComponentsObjectsHarmony(ids: BitIds, fromOriginalScope = false): Promise<ComponentWithDependencies[]> {
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(this.scope);
    try {
      await scopeComponentsImporter.importManyDeltaWithoutDeps(ids);
    } catch (err) {
      loader.stop();
      // @todo: remove once the server is deployed with this new "component-delta" type
      if (err && err.message && err.message.includes('type component-delta was not implemented')) {
        return this.importComponents(ids.toVersionLatest(), true);
      }
      throw err;
    }
    loader.start(`import ${ids.length} components with their dependencies (if missing)`);
    const versionDependenciesArr: VersionDependencies[] = fromOriginalScope
      ? await scopeComponentsImporter.importManyFromOriginalScopes(ids)
      : await scopeComponentsImporter.importMany(ids);
    const componentWithDependencies = await multipleVersionDependenciesToConsumer(
      versionDependenciesArr,
      this.scope.objects
    );

    return componentWithDependencies;
  }

  async shouldDependenciesSavedAsComponents(bitIds: BitId[], saveDependenciesAsComponents?: boolean) {
    if (saveDependenciesAsComponents === undefined) {
      saveDependenciesAsComponents = this.config._saveDependenciesAsComponents;
    }
    const remotes: Remotes = await getScopeRemotes(this.scope);
    const shouldDependenciesSavedAsComponents = bitIds.map((bitId: BitId) => {
      return {
        id: bitId, // if it doesn't go to the hub, it can't import dependencies as packages
        saveDependenciesAsComponents: saveDependenciesAsComponents || !remotes.isHub(bitId.scope as string),
      };
    });
    return shouldDependenciesSavedAsComponents;
  }

  /**
   * By default, the dists paths are inside the component.
   * If dist attribute is populated in bit.json, the paths are in consumer-root/dist-target.
   */
  shouldDistsBeInsideTheComponent(): boolean {
    return !this.config._distEntry && !this.config._distTarget;
  }

  async listComponentsForAutoTagging(modifiedComponents: BitIds): Promise<Component[]> {
    return getAutoTagPending(this, modifiedComponents);
  }

  /**
   * Check whether a model representation and file-system representation of the same component is the same.
   * The way how it is done is by converting the file-system representation of the component into
   * a Version object. Once this is done, we have two Version objects, and we can compare their hashes
   */
  async isComponentModified(componentFromModel: Version, componentFromFileSystem: Component): Promise<boolean> {
    if (!(componentFromModel instanceof Version)) {
      throw new TypeError(
        `isComponentModified expects componentFromModel to be Version, got ${typeof componentFromModel}`
      );
    }
    if (!(componentFromFileSystem instanceof Component)) {
      throw new TypeError(
        `isComponentModified expects componentFromFileSystem to be ConsumerComponent, got ${typeof componentFromFileSystem}`
      );
    }
    if (typeof componentFromFileSystem._isModified === 'undefined') {
      const componentMap = this.bitMap.getComponent(componentFromFileSystem.id);
      if (componentMap.originallySharedDir) {
        componentFromFileSystem.originallySharedDir = componentMap.originallySharedDir;
      }
      componentFromFileSystem.log = componentFromModel.log; // ignore the log, it's irrelevant for the comparison
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const { version } = await this.scope.sources.consumerComponentToVersion({
        consumer: this,
        consumerComponent: componentFromFileSystem,
      });

      // sometime dependencies from the FS don't have an exact version.
      const copyDependenciesVersionsFromModelToFS = (dependenciesFS: Dependencies, dependenciesModel: Dependencies) => {
        dependenciesFS.get().forEach((dependency) => {
          const dependencyFromModel = dependenciesModel
            .get()
            .find((modelDependency) => modelDependency.id.isEqualWithoutVersion(dependency.id));
          if (dependencyFromModel && !dependency.id.hasVersion()) {
            dependency.id = dependencyFromModel.id;
          }
        });
      };
      copyDependenciesVersionsFromModelToFS(version.dependencies, componentFromModel.dependencies);
      copyDependenciesVersionsFromModelToFS(version.devDependencies, componentFromModel.devDependencies);

      sortProperties(version);

      // prefix your command with "BIT_LOG=*" to see the actual id changes
      if (process.env.BIT_LOG && componentFromModel.calculateHash().hash !== version.calculateHash().hash) {
        console.log('-------------------componentFromModel------------------------'); // eslint-disable-line no-console
        console.log(componentFromModel.id()); // eslint-disable-line no-console
        console.log('------------------------componentFromFileSystem (version)----'); // eslint-disable-line no-console
        console.log(version.id()); // eslint-disable-line no-console
        console.log('-------------------------END---------------------------------'); // eslint-disable-line no-console
      }
      componentFromFileSystem._isModified = componentFromModel.calculateHash().hash !== version.calculateHash().hash;
    }
    return componentFromFileSystem._isModified;

    function sortProperties(version) {
      // sort the files by 'relativePath' because the order can be changed when adding or renaming
      // files in bitmap, which affects later on the model.
      version.files = R.sortBy(R.prop('relativePath'), version.files);
      componentFromModel.files = R.sortBy(R.prop('relativePath'), componentFromModel.files);
      version.dependencies.sort();
      version.devDependencies.sort();
      version.packageDependencies = sortObject(version.packageDependencies);
      version.devPackageDependencies = sortObject(version.devPackageDependencies);
      version.compilerPackageDependencies = sortObject(version.compilerPackageDependencies);
      version.testerPackageDependencies = sortObject(version.testerPackageDependencies);
      version.peerPackageDependencies = sortObject(version.peerPackageDependencies);
      sortOverrides(version.overrides);
      componentFromModel.dependencies.sort();
      componentFromModel.devDependencies.sort();
      componentFromModel.packageDependencies = sortObject(componentFromModel.packageDependencies);
      componentFromModel.devPackageDependencies = sortObject(componentFromModel.devPackageDependencies);
      componentFromModel.compilerPackageDependencies = sortObject(componentFromModel.compilerPackageDependencies);
      componentFromModel.testerPackageDependencies = sortObject(componentFromModel.testerPackageDependencies);
      componentFromModel.peerPackageDependencies = sortObject(componentFromModel.peerPackageDependencies);
      sortOverrides(componentFromModel.overrides);
    }
    function sortOverrides(overrides) {
      if (!overrides) return;
      DEPENDENCIES_FIELDS.forEach((field) => {
        if (overrides[field]) overrides[field] = sortObject(overrides[field]);
      });
    }
  }

  async getManyComponentsStatuses(ids: BitId[]): Promise<ComponentStatusResult[]> {
    return this.componentStatusLoader.getManyComponentsStatuses(ids);
  }

  async getComponentStatusById(id: BitId): Promise<ComponentStatus> {
    return this.componentStatusLoader.getComponentStatusById(id);
  }

  async tag(
    tagParams: {
      ids: BitIds;
      exactVersion: string | undefined;
      releaseType: semver.ReleaseType;
      incrementBy?: number;
      ignoreUnresolvedDependencies: boolean | undefined;
    } & BasicTagParams
  ): Promise<{
    taggedComponents: Component[];
    autoTaggedResults: AutoTagResult[];
    isSoftTag: boolean;
    publishedPackages: string[];
  }> {
    if (this.isLegacy) {
      tagParams.persist = true;
    }
    const { ids, persist } = tagParams;
    logger.debug(`tagging the following components: ${ids.toString()}`);
    Analytics.addBreadCrumb('tag', `tagging the following components: ${Analytics.hashData(ids)}`);
    if (persist) {
      await this.componentFsCache.deleteAllDependenciesDataCache();
    }
    const components = await this._loadComponentsForTag(ids);
    this.throwForComponentIssues(components, tagParams.ignoreUnresolvedDependencies);
    const areComponentsMissingFromScope = components.some((c) => !c.componentFromModel && c.id.hasScope());
    if (areComponentsMissingFromScope) {
      throw new ComponentsPendingImport();
    }

    const { taggedComponents, autoTaggedResults, publishedPackages } = await tagModelComponent({
      ...tagParams,
      consumerComponents: components,
      scope: this.scope,
      consumer: this,
    });

    return { taggedComponents, autoTaggedResults, isSoftTag: tagParams.soft, publishedPackages };
  }

  private throwForComponentIssues(components: Component[], ignoreUnresolvedDependencies?: boolean) {
    components.forEach((component) => {
      if (this.isLegacy && component.issues) {
        component.issues.delete(IssuesClasses.relativeComponentsAuthored);
      }
    });
    if (!ignoreUnresolvedDependencies) {
      const componentsWithBlockingIssues = components.filter((component) => component.issues?.shouldBlockTagging());
      if (!R.isEmpty(componentsWithBlockingIssues)) throw new MissingDependencies(componentsWithBlockingIssues);
    }
  }

  updateNextVersionOnBitmap(taggedComponents: Component[], exactVersion, releaseType) {
    taggedComponents.forEach((taggedComponent) => {
      const log = taggedComponent.log;
      if (!log) throw new Error('updateNextVersionOnBitmap, unable to get log');
      const nextVersion = {
        version: exactVersion || releaseType,
        message: log.message,
        username: log.username,
        email: log.email,
      };
      if (!taggedComponent.componentMap) throw new Error('updateNextVersionOnBitmap componentMap is missing');
      taggedComponent.componentMap.updateNextVersion(nextVersion);
    });

    if (taggedComponents.length) this.bitMap.markAsChanged();
  }

  async snap({
    ids,
    message = '',
    ignoreUnresolvedDependencies = false,
    force = false,
    skipTests = false,
    verbose = false,
    build,
    skipAutoSnap = false,
    resolveUnmerged = false,
    forceDeploy = false,
  }: {
    ids: BitIds;
    message?: string;
    ignoreUnresolvedDependencies?: boolean;
    force?: boolean;
    skipTests?: boolean;
    verbose?: boolean;
    build: boolean;
    skipAutoSnap?: boolean;
    resolveUnmerged?: boolean;
    forceDeploy?: boolean;
  }): Promise<{ snappedComponents: Component[]; autoSnappedResults: AutoTagResult[] }> {
    logger.debugAndAddBreadCrumb('consumer.snap', `snapping the following components: {components}`, {
      components: ids.toString(),
    });
    const components = await this._loadComponentsForTag(ids);

    this.throwForComponentIssues(components, ignoreUnresolvedDependencies);
    const areComponentsMissingFromScope = components.some((c) => !c.componentFromModel && c.id.hasScope());
    if (areComponentsMissingFromScope) {
      throw new ComponentsPendingImport();
    }

    const { taggedComponents, autoTaggedResults } = await tagModelComponent({
      consumerComponents: components,
      ignoreNewestVersion: false,
      scope: this.scope,
      message,
      force,
      consumer: this,
      skipTests,
      verbose,
      skipAutoTag: skipAutoSnap,
      persist: true,
      soft: false,
      build,
      resolveUnmerged,
      isSnap: true,
      disableDeployPipeline: false,
      forceDeploy,
    });

    return { snappedComponents: taggedComponents, autoSnappedResults: autoTaggedResults };
  }

  async _loadComponentsForTag(ids: BitIds): Promise<Component[]> {
    const { components } = await this.loadComponents(ids);
    if (this.isLegacy) {
      return components;
    }
    let shouldReloadComponents = false;
    const componentsWithRelativePaths: string[] = [];
    const componentsWithFilesNotDir: string[] = [];
    const componentsWithCustomModuleResolution: string[] = [];
    components.forEach((component) => {
      const componentMap = component.componentMap as ComponentMap;
      if (componentMap.rootDir) return;
      const hasRelativePaths = component.issues?.getIssue(IssuesClasses.relativeComponentsAuthored);
      const hasCustomModuleResolutions = component.issues?.getIssue(IssuesClasses.MissingCustomModuleResolutionLinks);
      // leaving this because it can be helpful for users upgrade from legacy
      if (componentMap.trackDir && !hasRelativePaths) {
        componentMap.changeRootDirAndUpdateFilesAccordingly(componentMap.trackDir);
        shouldReloadComponents = true;
        return;
      }
      if (hasRelativePaths) {
        componentsWithRelativePaths.push(component.id.toStringWithoutVersion());
      }
      if (!componentMap.trackDir) {
        componentsWithFilesNotDir.push(component.id.toStringWithoutVersion());
      }
      if (hasCustomModuleResolutions) {
        componentsWithCustomModuleResolution.push(component.id.toStringWithoutVersion());
      }
    });
    if (componentsWithRelativePaths.length || componentsWithFilesNotDir.length) {
      throw new FailedLoadForTag(
        componentsWithRelativePaths.sort(),
        componentsWithFilesNotDir.sort(),
        componentsWithCustomModuleResolution.sort()
      );
    }
    if (!shouldReloadComponents) return components;
    this.clearCache();
    const { components: reloadedComponents } = await this.loadComponents(ids);
    return reloadedComponents;
  }

  async updateComponentsVersions(components: Array<ModelComponent | Component>): Promise<any> {
    const getPackageJsonDir = (
      componentMap: ComponentMap,
      component: Component,
      id: BitId
    ): PathRelative | null | undefined => {
      if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) {
        if (componentMap.hasRootDir()) return null; // no package.json in this case
        return getNodeModulesPathOfComponent({ ...component, id, allowNonScope: true });
      }
      return componentMap.rootDir;
    };
    const currentLane = this.getCurrentLaneId();
    const isAvailableOnMaster = async (component: ModelComponent | Component): Promise<boolean> => {
      if (currentLane.isDefault()) return true;
      const modelComponent =
        component instanceof ModelComponent ? component : await this.scope.getModelComponent(component.id);
      return modelComponent.hasHead();
    };

    const updateVersions = async (unknownComponent) => {
      const id: BitId =
        unknownComponent instanceof ModelComponent
          ? unknownComponent.toBitIdWithLatestVersionAllowNull()
          : unknownComponent.id;
      this.bitMap.updateComponentId(id);
      const availableOnMaster = await isAvailableOnMaster(unknownComponent);
      if (!availableOnMaster) {
        this.bitMap.setComponentProp(id, 'onLanesOnly', true);
      }
      const componentMap = this.bitMap.getComponent(id);
      componentMap.clearNextVersion();
      if (this.isLegacy) {
        // on Harmony, components don't have package.json
        const component =
          unknownComponent instanceof Component
            ? unknownComponent
            : await this.loadComponent(unknownComponent.toBitId());
        const packageJsonDir = getPackageJsonDir(componentMap, component, id);
        packageJsonDir // if it has package.json, it's imported, which must have a version
          ? await packageJsonUtils.updateAttribute(this, packageJsonDir, 'version', id.version as string)
          : await Promise.resolve();
      }
    };
    // important! DO NOT use Promise.all here! otherwise, you're gonna enter into a whole world of pain.
    // imagine tagging comp1 with auto-tagged comp2, comp1 package.json is written while comp2 is
    // trying to get the dependencies of comp1 using its package.json.
    return mapSeries(components, updateVersions);
  }

  getComponentIdFromNodeModulesPath(requirePath: string, bindingPrefix: string): BitId {
    const { packageName } = this.splitPackagePathToNameAndFile(requirePath);
    return packageNameToComponentId(this, packageName, bindingPrefix);
  }

  /**
   * e.g.
   * input: @bit/my-scope.my-name/internal-path.js
   * output: { packageName: '@bit/my-scope', internalPath: 'internal-path.js' }
   */
  splitPackagePathToNameAndFile(packagePath: string): { packageName: string; internalPath: string } {
    const packagePathWithoutNM = this.stripNodeModulesFromPackagePath(packagePath);
    const packageSplitBySlash = packagePathWithoutNM.split('/');
    const isScopedPackage = packagePathWithoutNM.startsWith('@');
    const packageName = isScopedPackage
      ? `${packageSplitBySlash.shift()}/${packageSplitBySlash.shift()}`
      : (packageSplitBySlash.shift() as string);

    const internalPath = packageSplitBySlash.join('/');

    return { packageName, internalPath };
  }

  private stripNodeModulesFromPackagePath(requirePath: string): string {
    requirePath = pathNormalizeToLinux(requirePath);
    const prefix = requirePath.includes('node_modules') ? 'node_modules/' : '';
    const withoutPrefix = prefix ? requirePath.substr(requirePath.indexOf(prefix) + prefix.length) : requirePath;
    if (!withoutPrefix.includes('/') && withoutPrefix.startsWith('@')) {
      throw new GeneralError(
        'getComponentIdFromNodeModulesPath expects the path to have at least one slash for the scoped package, such as @bit/'
      );
    }
    return withoutPrefix;
  }

  composeRelativeComponentPath(bitId: BitId): string {
    const { componentsDefaultDirectory } = this.dirStructure;
    // in the past, scope was the full-scope (owner+scope-name), currently, scope is only the scope-name.
    const compDirBackwardCompatible = this.isLegacy
      ? componentsDefaultDirectory.replace('{scope}', '{scopeId}')
      : componentsDefaultDirectory;
    return composeComponentPath(bitId, compDirBackwardCompatible);
  }

  composeComponentPath(bitId: BitId): PathOsBasedAbsolute {
    const addToPath = [this.getPath(), this.composeRelativeComponentPath(bitId)];
    logger.debug(`component dir path: ${addToPath.join('/')}`);
    Analytics.addBreadCrumb('composeComponentPath', `component dir path: ${Analytics.hashData(addToPath.join('/'))}`);
    return path.join(...addToPath);
  }

  composeRelativeDependencyPath(bitId: BitId): PathOsBased {
    const dependenciesDir = this.dirStructure.dependenciesDirStructure;
    return composeDependencyPath(bitId, dependenciesDir);
  }

  composeDependencyPath(bitId: BitId): PathOsBased {
    const relativeDependencyPath = this.composeRelativeDependencyPath(bitId);
    return path.join(this.getPath(), relativeDependencyPath);
  }

  static create(
    projectPath: PathOsBasedAbsolute,
    noGit = false,
    workspaceConfigProps?: WorkspaceConfigProps
  ): Promise<Consumer> {
    return this.ensure(projectPath, noGit, workspaceConfigProps);
  }

  static _getScopePath(projectPath: PathOsBasedAbsolute, noGit: boolean): PathOsBasedAbsolute {
    const gitDirPath = path.join(projectPath, DOT_GIT_DIR);
    let resolvedScopePath = path.join(projectPath, BIT_HIDDEN_DIR);
    if (!noGit && fs.existsSync(gitDirPath) && !fs.existsSync(resolvedScopePath)) {
      resolvedScopePath = path.join(gitDirPath, BIT_GIT_DIR);
    }
    return resolvedScopePath;
  }

  static async ensure(
    projectPath: PathOsBasedAbsolute,
    standAlone = false,
    workspaceConfigProps?: WorkspaceConfigProps
  ): Promise<Consumer> {
    const resolvedScopePath = Consumer._getScopePath(projectPath, standAlone);
    let existingGitHooks;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const scopeP = Scope.ensure(resolvedScopePath);

    const configP = WorkspaceConfig.ensure(projectPath, standAlone, workspaceConfigProps);
    const [scope, config] = await Promise.all([scopeP, configP]);
    const consumer = new Consumer({
      projectPath,
      created: true,
      scope,
      config,
      existingGitHooks,
    });
    await consumer.setBitMap();
    return consumer;
  }

  /**
   * if resetHard, delete consumer-files: bitMap and bit.json and also the local scope (.bit dir).
   * otherwise, delete the consumer-files only when they are corrupted
   */
  static async reset(projectPath: PathOsBasedAbsolute, resetHard: boolean, noGit = false): Promise<void> {
    const resolvedScopePath = Consumer._getScopePath(projectPath, noGit);
    BitMap.reset(projectPath, resetHard);
    const scopeP = Scope.reset(resolvedScopePath, resetHard);
    const configP = WorkspaceConfig.reset(projectPath, resetHard);
    await Promise.all([scopeP, configP]);
  }

  async resetNew() {
    this.bitMap.resetToNewComponents();
    await Scope.reset(this.scope.path, true);
  }

  static async createIsolatedWithExistingScope(consumerPath: PathOsBased, scope: Scope): Promise<Consumer> {
    // if it's an isolated environment, it's normal to have already the consumer
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const config = await WorkspaceConfig._ensure(consumerPath);
    // isolated environments in the workspace rely on a physical node_modules folder
    // for this reason, we must use a package manager that supports one
    config.packageManager = 'npm';
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const consumer = new Consumer({
      projectPath: consumerPath,
      created: true,
      scope,
      isolated: true,
      // @ts-ignore @gilad, the config type is incorrect indeed
      config,
    });
    await consumer.setBitMap();
    return consumer;
  }

  static locateProjectScope(projectPath: string) {
    if (fs.existsSync(path.join(projectPath, DOT_GIT_DIR, BIT_GIT_DIR))) {
      return path.join(projectPath, DOT_GIT_DIR, BIT_GIT_DIR);
    }
    if (fs.existsSync(path.join(projectPath, BIT_HIDDEN_DIR))) {
      return path.join(projectPath, BIT_HIDDEN_DIR);
    }
    return undefined;
  }
  static async load(currentPath: PathOsBasedAbsolute): Promise<Consumer> {
    const consumerInfo = await getConsumerInfo(currentPath);
    if (!consumerInfo) {
      return Promise.reject(new ConsumerNotFound());
    }
    let consumer: Consumer | undefined;

    if ((!consumerInfo.hasConsumerConfig || !consumerInfo.hasScope) && consumerInfo.hasBitMap) {
      consumer = await Consumer.create(consumerInfo.path);
      await Promise.all([consumer.config.write({ workspaceDir: consumer.projectPath }), consumer.scope.ensureDir()]);
    }
    const config = consumer && consumer.config ? consumer.config : await WorkspaceConfig.loadIfExist(consumerInfo.path);
    const scopePath = Consumer.locateProjectScope(consumerInfo.path);
    const scope = await Scope.load(scopePath as string);
    consumer = new Consumer({
      projectPath: consumerInfo.path,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      config,
      scope,
    });
    await consumer.setBitMap();
    return consumer;
  }

  /**
   * legacy is a workspace uses the old bit.json or "bit" prop of package.json.
   * new workspaces use workspace.jsonc file
   */
  get isLegacy(): boolean {
    if (!('isLegacy' in this.config)) {
      // this happens for example when running `bit import --compiler`. the environment dir has its
      // own consumer and the config is not ILegacyWorkspaceConfig but WorkspaceConfig
      return true;
    }
    return this.config.isLegacy;
  }

  /**
   * clean up removed components from bitmap
   * @param {BitIds} componentsToRemoveFromFs - delete component that are used by other components.
   * @param {BitIds} removedDependencies - delete component that are used by other components.
   */
  async cleanFromBitMap(componentsToRemoveFromFs: BitIds, removedDependencies: BitIds) {
    logger.debug(`consumer.cleanFromBitMap, cleaning ${componentsToRemoveFromFs.toString()} from .bitmap`);
    this.bitMap.removeComponents(componentsToRemoveFromFs);
    this.bitMap.removeComponents(removedDependencies);
  }

  async addRemoteAndLocalVersionsToDependencies(component: Component, loadedFromFileSystem: boolean) {
    logger.debug(`addRemoteAndLocalVersionsToDependencies for ${component.id.toString()}`);
    Analytics.addBreadCrumb(
      'addRemoteAndLocalVersionsToDependencies',
      `addRemoteAndLocalVersionsToDependencies for ${Analytics.hashData(component.id.toString())}`
    );
    let modelDependencies = new Dependencies([]);
    let modelDevDependencies = new Dependencies([]);
    if (loadedFromFileSystem) {
      // when loaded from file-system, the dependencies versions are fetched from bit.map.
      // find the model version of the component and get the stored versions of the dependencies
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const mainComponentFromModel: Component = component.componentFromModel;
      if (mainComponentFromModel) {
        // otherwise, the component is probably on the file-system only and not on the model.
        modelDependencies = mainComponentFromModel.dependencies;
        modelDevDependencies = mainComponentFromModel.devDependencies;
      }
    }
    await component.dependencies.addRemoteAndLocalVersions(this.scope, modelDependencies);
    await component.devDependencies.addRemoteAndLocalVersions(this.scope, modelDevDependencies);
  }

  async getAuthoredAndImportedDependentsIdsOf(components: Component[]): Promise<BitIds> {
    const authoredAndImportedComponents = this.bitMap.getAllIdsAvailableOnLane([
      COMPONENT_ORIGINS.IMPORTED,
      COMPONENT_ORIGINS.AUTHORED,
    ]);
    const componentsIds = BitIds.fromArray(components.map((c) => c.id));
    return this.scope.findDirectDependentComponents(authoredAndImportedComponents, componentsIds);
  }

  async getAuthoredAndImportedDependentsComponentsOf(components: Component[]): Promise<Component[]> {
    const dependentsIds = await this.getAuthoredAndImportedDependentsIdsOf(components);
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(this.scope);

    const versionDependenciesArr = await scopeComponentsImporter.importMany(dependentsIds);
    const manipulateDirData = await getManipulateDirWhenImportingComponents(
      this.bitMap,
      versionDependenciesArr,
      this.scope.objects
    );
    const dependentComponentsP = versionDependenciesArr.map((c) =>
      c.component.toConsumer(this.scope.objects, manipulateDirData)
    );
    return Promise.all(dependentComponentsP);
  }

  async injectConf(componentId: BitId, force: boolean) {
    const component = await this.loadComponent(componentId);
    return component.injectConfig(this.getPath(), this.bitMap, force);
  }

  _getEnvProps(envType: EnvType, context: Record<string, any> | undefined) {
    const envs = this.config._getEnvsByType(envType);
    if (!envs) return undefined;
    const envName = Object.keys(envs)[0];
    const envObject = envs[envName];
    return {
      name: envName,
      consumerPath: this.getPath(),
      scopePath: this.scope.getPath(),
      rawConfig: envObject.rawConfig,
      files: envObject.files,
      bitJsonPath: path.dirname(this.config.path),
      options: envObject.options,
      envType,
      context,
    };
  }

  async writeBitMap() {
    await this.bitMap.write(this.componentFsCache);
  }

  async onDestroy() {
    await this.cleanTmpFolder();
    await this.scope.scopeJson.writeIfChanged(this.scope.path);
    await this.writeBitMap();
  }
}
