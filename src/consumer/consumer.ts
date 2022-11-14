import fs from 'fs-extra';
import * as path from 'path';
import R from 'ramda';
import semver from 'semver';
import { partition } from 'lodash';
import { DEFAULT_LANE, LaneId } from '@teambit/lane-id';
import { Analytics } from '../analytics/analytics';
import { BitId, BitIds } from '../bit-id';
import { BitIdStr } from '../bit-id/bit-id';
import loader from '../cli/loader';
import { BEFORE_MIGRATION } from '../cli/loader/loader-messages';
import {
  BIT_GIT_DIR,
  BIT_HIDDEN_DIR,
  BIT_WORKSPACE_TMP_DIRNAME,
  DEPENDENCIES_FIELDS,
  DOT_GIT_DIR,
  LATEST,
} from '../constants';
import GeneralError from '../error/general-error';
import logger from '../logger/logger';
import { ComponentWithDependencies, Scope } from '../scope';
import { getAutoTagPending } from '../scope/component-ops/auto-tag';
import { ComponentNotFound } from '../scope/exceptions';
import { Lane, ModelComponent, Version } from '../scope/models';
import { pathNormalizeToLinux, sortObject } from '../utils';
import { composeComponentPath, composeDependencyPath } from '../utils/bit/compose-component-path';
import { packageNameToComponentId } from '../utils/bit/package-name-to-component-id';
import {
  PathAbsolute,
  PathLinuxRelative,
  PathOsBased,
  PathOsBasedAbsolute,
  PathOsBasedRelative,
  PathRelative,
} from '../utils/path';
import BitMap, { CURRENT_BITMAP_SCHEMA } from './bit-map/bit-map';
import { NextVersion } from './bit-map/component-map';
import Component from './component';
import { ComponentStatus, ComponentStatusLoader, ComponentStatusResult } from './component-ops/component-status-loader';
import ComponentLoader, { ComponentLoadOptions, LoadManyResult } from './component/component-loader';
import { Dependencies } from './component/dependencies';
import PackageJsonFile from './component/package-json-file';
import { ILegacyWorkspaceConfig } from './config';
import WorkspaceConfig, { WorkspaceConfigProps } from './config/workspace-config';
import { getConsumerInfo } from './consumer-locator';
import DirStructure from './dir-structure/dir-structure';
import { ConsumerNotFound } from './exceptions';
import migrate, { ConsumerMigrationResult } from './migrations/consumer-migrator';
import migratonManifest from './migrations/consumer-migrator-manifest';
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

  get bitmapIdsFromCurrentLaneIncludeRemoved(): BitIds {
    const idsFromBitMap = this.bitMap.getAllIdsAvailableOnLane();
    const removedIds = this.bitMap.getRemoved();
    return BitIds.fromArray([...idsFromBitMap, ...removedIds]);
  }

  get bitMapIdsFromAllLanes(): BitIds {
    return this.bitMap.getAllBitIdsFromAllLanes();
  }

  clearCache() {
    this.componentLoader.clearComponentsCache();
    this.onCacheClear.forEach((func) => func());
  }

  getTmpFolder(fullPath = false): PathOsBased {
    if (!fullPath) {
      return BIT_WORKSPACE_TMP_DIRNAME;
    }
    return path.join(this.getPath(), BIT_WORKSPACE_TMP_DIRNAME);
  }

  getCurrentLaneId(): LaneId {
    return this.bitMap.laneId || this.getDefaultLaneId();
  }

  getDefaultLaneId() {
    return LaneId.from(DEFAULT_LANE, this.scope.name);
  }

  /**
   * the name can be a full lane-id or only the lane-name, which can be the alias (local-lane) or the remote-name.
   */
  async getParsedLaneId(name: string): Promise<LaneId> {
    return this.scope.lanes.parseLaneIdFromString(name);
  }

  isOnLane(): boolean {
    return !this.isOnMain();
  }

  isOnMain(): boolean {
    return this.getCurrentLaneId().isDefault();
  }

  async getCurrentLaneObject(): Promise<Lane | null> {
    return this.scope.loadLane(this.getCurrentLaneId());
  }

  setCurrentLane(laneId: LaneId, exported = true) {
    this.bitMap.setCurrentLane(laneId, exported);
    this.scope.setCurrentLaneId(laneId);
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
   * @returns {Object} - wether the process run and wether it succeeded
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
    await result.bitMap.write();

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

    return modelComponent.toConsumerComponent(id.version, this.scope.name, this.scope.objects);
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
      return modelComponent.toConsumerComponent(versionNum, this.scope.name, this.scope.objects);
    });
    return Promise.all(componentsP);
  }

  /**
   * For legacy, it loads all the dependencies. For Harmony, it's not needed.
   */
  async loadComponentWithDependenciesFromModel(id: BitId, throwIfNotExist = true): Promise<ComponentWithDependencies> {
    const scopeComponentsImporter = this.scope.scopeImporter;
    const getModelComponent = async (): Promise<ModelComponent> => {
      if (throwIfNotExist) return this.scope.getModelComponent(id);
      const modelComponent = await this.scope.getModelComponentIfExist(id);
      if (modelComponent) return modelComponent;
      await scopeComponentsImporter.importMany({ ids: new BitIds(id) });
      return this.scope.getModelComponent(id);
    };
    const modelComponent = await getModelComponent();
    if (!id.version) {
      throw new TypeError('consumer.loadComponentWithDependenciesFromModel, version is missing from the id');
    }

    const compVersion = modelComponent.toComponentVersion(id.version);
    const consumerComp = await compVersion.toConsumer(this.scope.objects);
    return new ComponentWithDependencies({
      component: consumerComp,
      dependencies: [],
      devDependencies: [],
      extensionDependencies: [],
    });
  }

  async loadComponent(id: BitId, loadOpts?: ComponentLoadOptions): Promise<Component> {
    const { components } = await this.loadComponents(BitIds.fromArray([id]), true, loadOpts);
    return components[0];
  }

  async loadComponents(ids: BitIds, throwOnFailure = true, loadOpts?: ComponentLoadOptions): Promise<LoadManyResult> {
    return this.componentLoader.loadMany(ids, throwOnFailure, loadOpts);
  }

  async shouldDependenciesSavedAsComponents(bitIds: BitId[], saveDependenciesAsComponents?: boolean) {
    if (saveDependenciesAsComponents === undefined) {
      saveDependenciesAsComponents = this.config._saveDependenciesAsComponents;
    }
    const shouldDependenciesSavedAsComponents = bitIds.map((bitId: BitId) => {
      return {
        id: bitId, // if it doesn't go to the hub, it can't import dependencies as packages
        saveDependenciesAsComponents: false,
      };
    });
    return shouldDependenciesSavedAsComponents;
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
      componentFromFileSystem.log = componentFromModel.log; // ignore the log, it's irrelevant for the comparison
      const { version } = await this.scope.sources.consumerComponentToVersion(componentFromFileSystem);

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
      version.peerPackageDependencies = sortObject(version.peerPackageDependencies);
      sortOverrides(version.overrides);
      componentFromModel.dependencies.sort();
      componentFromModel.devDependencies.sort();
      componentFromModel.packageDependencies = sortObject(componentFromModel.packageDependencies);
      componentFromModel.devPackageDependencies = sortObject(componentFromModel.devPackageDependencies);
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

  /**
   * Check whether the component files from the model and from the file-system of the same component is the same.
   */
  async isComponentSourceCodeModified(
    componentFromModel: Version,
    componentFromFileSystem: Component
  ): Promise<boolean> {
    if (componentFromFileSystem._isModified === false) {
      // we only check for "false". if it's "true", it can be dependency changes not necessarily component files changes
      return false;
    }
    componentFromFileSystem.log = componentFromModel.log; // in order to convert to Version object
    const { version } = await this.scope.sources.consumerComponentToVersion(componentFromFileSystem);

    version.files = R.sortBy(R.prop('relativePath'), version.files);
    componentFromModel.files = R.sortBy(R.prop('relativePath'), componentFromModel.files);
    return JSON.stringify(version.files) !== JSON.stringify(componentFromModel.files);
  }

  async getManyComponentsStatuses(ids: BitId[]): Promise<ComponentStatusResult[]> {
    return this.componentStatusLoader.getManyComponentsStatuses(ids);
  }

  async getComponentStatusById(id: BitId): Promise<ComponentStatus> {
    return this.componentStatusLoader.getComponentStatusById(id);
  }

  updateNextVersionOnBitmap(componentsToTag: Component[], preRelease?: string) {
    componentsToTag.forEach((compToTag) => {
      const log = compToTag.log;
      if (!log) throw new Error('updateNextVersionOnBitmap, unable to get log');
      const version = compToTag.version as string;
      const nextVersion: NextVersion = {
        version,
        message: log.message,
        username: log.username,
        email: log.email,
      };
      if (preRelease) nextVersion.preRelease = preRelease;
      if (!compToTag.componentMap) throw new Error('updateNextVersionOnBitmap componentMap is missing');
      compToTag.componentMap.updateNextVersion(nextVersion);
    });

    if (componentsToTag.length) this.bitMap.markAsChanged();
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
    const withoutPrefix = prefix ? requirePath.slice(requirePath.indexOf(prefix) + prefix.length) : requirePath;
    if (!withoutPrefix.includes('/') && withoutPrefix.startsWith('@')) {
      throw new GeneralError(
        'getComponentIdFromNodeModulesPath expects the path to have at least one slash for the scoped package, such as @bit/'
      );
    }
    return withoutPrefix;
  }

  composeRelativeComponentPath(bitId: BitId): PathLinuxRelative {
    const { componentsDefaultDirectory } = this.dirStructure;

    return composeComponentPath(bitId, componentsDefaultDirectory);
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
    const packageJsonP = PackageJsonFile.reset(projectPath);
    await Promise.all([scopeP, configP, packageJsonP]);
  }

  async resetNew() {
    this.bitMap.resetToNewComponents();
    await Scope.reset(this.scope.path, true);
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
    if (!consumerInfo.hasBitMap && !consumerInfo.hasScope && consumerInfo.hasConsumerConfig) {
      throw new Error(
        `fatal: unable to load the workspace. workspace.jsonc exists, but the .bitmap and local-scope are missing. run "bit init" to generate the missing files`
      );
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
    scope.setCurrentLaneId(consumer.bitMap.laneId);
    logger.commandHistory.fileBasePath = scope.getPath();
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
   */
  async cleanFromBitMap(componentsToRemoveFromFs: BitIds) {
    logger.debug(`consumer.cleanFromBitMap, cleaning ${componentsToRemoveFromFs.toString()} from .bitmap`);
    this.bitMap.removeComponents(componentsToRemoveFromFs);
  }

  async cleanOrRevertFromBitMapWhenOnLane(ids: BitIds) {
    logger.debug(`consumer.cleanFromBitMapWhenOnLane, cleaning ${ids.toString()} from`);
    const [idsOnLane, idsOnMain] = partition(ids, (id) => {
      const componentMap = this.bitMap.getComponent(id, { ignoreVersion: true });
      return componentMap.onLanesOnly;
    });
    if (idsOnLane.length) {
      await this.cleanFromBitMap(BitIds.fromArray(idsOnLane));
    }
    await Promise.all(
      idsOnMain.map(async (id) => {
        const modelComp = await this.scope.getModelComponentIfExist(id.changeVersion(undefined));
        let updatedId = id.changeScope(undefined).changeVersion(undefined);
        if (modelComp) {
          const head = modelComp.getHeadAsTagIfExist();
          if (head) updatedId = id.changeVersion(head);
        }
        this.bitMap.updateComponentId(updatedId, false, true);
      })
    );
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

  async getIdsOfDefaultLane(): Promise<BitIds> {
    const ids = this.bitMap.getAuthoredAndImportedBitIdsOfDefaultLane();
    const bitIds = await Promise.all(
      ids.map(async (id) => {
        if (!id.hasVersion()) return id;
        const modelComponent = await this.scope.getModelComponentIfExist(id.changeVersion(undefined));
        if (modelComponent) {
          const head = modelComponent.getHeadAsTagIfExist();
          if (head) {
            return id.changeVersion(head);
          }
          throw new Error(`model-component on main should have head. the head on ${id.toString()} is missing`);
        }
        if (!id.hasVersion()) {
          return id;
        }
        throw new Error(`getIdsOfDefaultLane: model-component of ${id.toString()} is missing, please run bit-import`);
      })
    );
    return BitIds.fromArray(bitIds);
  }

  async getAuthoredAndImportedDependentsIdsOf(components: Component[]): Promise<BitIds> {
    const authoredAndImportedComponents = this.bitMap.getAllIdsAvailableOnLane();
    const componentsIds = BitIds.fromArray(components.map((c) => c.id));
    return this.scope.findDirectDependentComponents(authoredAndImportedComponents, componentsIds);
  }

  async writeBitMap() {
    await this.backupBitMap();
    await this.bitMap.write();
  }

  private async backupBitMap() {
    if (!this.bitMap.hasChanged) return;
    try {
      const baseDir = path.join(this.scope.path, 'bitmap-history');
      await fs.ensureDir(baseDir);
      const backupPath = path.join(baseDir, `.bitmap-${this.currentDateAndTimeToFileName()}`);
      await fs.copyFile(this.bitMap.mapPath, backupPath);
    } catch (err) {
      // it's nice to have. don't kill the process if something goes wrong.
      logger.error(`failed to backup bitmap`, err);
    }
  }

  private currentDateAndTimeToFileName() {
    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    return `${year}-${month}-${day}-${hours}-${minutes}-${seconds}`;
  }

  async onDestroy() {
    await this.cleanTmpFolder();
    await this.scope.scopeJson.writeIfChanged(this.scope.path);
    await this.writeBitMap();
  }
}
