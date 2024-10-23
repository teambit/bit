import fs from 'fs-extra';
import * as path from 'path';
import R from 'ramda';
import { compact, isEmpty } from 'lodash';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { DEFAULT_LANE, LaneId } from '@teambit/lane-id';
import { BitIdStr } from '@teambit/legacy-bit-id';
import { BitError } from '@teambit/bit-error';
import { Analytics } from '@teambit/legacy.analytics';
import {
  BIT_GIT_DIR,
  BIT_HIDDEN_DIR,
  BIT_WORKSPACE_TMP_DIRNAME,
  DEFAULT_COMPONENTS_DIR_PATH,
  DEPENDENCIES_FIELDS,
  DOT_GIT_DIR,
  LATEST,
} from '../constants';
import logger from '../logger/logger';
import { Scope } from '../scope';
import { getAutoTagPending } from '../scope/component-ops/auto-tag';
import { ComponentNotFound, ScopeNotFound } from '../scope/exceptions';
import { Lane, ModelComponent, Version } from '../scope/models';
// import { generateRandomStr } from '@teambit/toolbox.string.random';
import { sortObjectByKeys } from '@teambit/toolbox.object.sorter';
import format from 'string-format';
import {
  PathAbsolute,
  PathLinuxRelative,
  PathOsBased,
  PathOsBasedAbsolute,
  PathOsBasedRelative,
  PathRelative,
  parseScope,
} from '@teambit/legacy.utils';
import { BitMap, NextVersion } from '@teambit/legacy.bit-map';
import Component from './component';
import ComponentLoader, { ComponentLoadOptions, LoadManyResult } from './component/component-loader';
import { Dependencies } from './component/dependencies';
import { PackageJsonFile } from '@teambit/component.sources';
import { ILegacyWorkspaceConfig } from './config';
import WorkspaceConfig from './config/workspace-config';
import { getConsumerInfo } from './consumer-locator';
import DirStructure from './dir-structure/dir-structure';
import { ConsumerNotFound } from './exceptions';
import { UnexpectedPackageName } from './exceptions/unexpected-package-name';
import { NoHeadNoVersion } from '../scope/exceptions/no-head-no-version';

type ConsumerProps = {
  projectPath: string;
  config: ILegacyWorkspaceConfig;
  scope: Scope;
  created?: boolean;
  isolated?: boolean;
  addedGitHooks?: string[] | undefined;
  existingGitHooks: string[] | undefined;
};

const BITMAP_HISTORY_DIR_NAME = 'bitmap-history';
const BITMAP_HISTORY_METADATA_FILE_NAME = 'bitmap-history-metadata.txt';

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
  packageJson: PackageJsonFile;
  public onCacheClear: Array<() => void | Promise<void>> = [];
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
    this.packageJson = PackageJsonFile.loadSync(projectPath);
  }
  async setBitMap() {
    // @ts-ignore todo: remove after deleting teambit.legacy
    this.bitMap = await BitMap.load(this);
  }

  setPackageJson(packageJson: PackageJsonFile) {
    this.packageJson = packageJson;
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get dirStructure(): DirStructure {
    if (!this._dirStructure) {
      this._dirStructure = new DirStructure(this.config.componentsDefaultDirectory);
    }
    return this._dirStructure;
  }

  get componentFsCache() {
    return this.componentLoader.componentFsCache;
  }

  get bitmapIdsFromCurrentLane(): ComponentIdList {
    return this.bitMap.getAllIdsAvailableOnLane();
  }

  get bitmapIdsFromCurrentLaneIncludeRemoved(): ComponentIdList {
    return this.bitMap.getAllIdsAvailableOnLaneIncludeRemoved();
  }

  async clearCache() {
    this.componentLoader.clearComponentsCache();
    await Promise.all(this.onCacheClear.map((func) => func()));
  }

  clearOneComponentCache(id: ComponentID) {
    this.componentLoader.clearOneComponentCache(id);
  }

  getTmpFolder(fullPath = false): PathOsBased {
    if (!fullPath) {
      return BIT_WORKSPACE_TMP_DIRNAME;
    }
    return path.join(this.getPath(), BIT_WORKSPACE_TMP_DIRNAME);
  }

  getCurrentLaneIdIfExist() {
    return this.bitMap.laneId;
  }

  getCurrentLaneId(): LaneId {
    return this.getCurrentLaneIdIfExist() || this.getDefaultLaneId();
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

  async getCurrentLaneObject(): Promise<Lane | undefined> {
    return this.scope.loadLane(this.getCurrentLaneId());
  }

  setCurrentLane(laneId: LaneId, exported = true) {
    this.bitMap.setCurrentLane(laneId, exported);
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

  async write(): Promise<Consumer> {
    await Promise.all([this.config.write({ workspaceDir: this.projectPath }), this.scope.ensureDir()]);
    this.bitMap.markAsChanged();
    await this.writeBitMap();
    await this.writePackageJson();
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

  getParsedId(id: BitIdStr, useVersionFromBitmap = false, searchWithoutScopeInProvidedId = false): ComponentID {
    if (id.startsWith('@')) {
      throw new UnexpectedPackageName(id);
    }

    const bitId = this.bitMap.getExistingBitId(id, true, searchWithoutScopeInProvidedId) as ComponentID;
    if (!useVersionFromBitmap) {
      const version = ComponentID.getVersionFromString(id);
      return bitId.changeVersion(version || LATEST);
    }
    return bitId;
  }

  getParsedIdIfExist(
    id: BitIdStr,
    useVersionFromBitmap = false,
    searchWithoutScopeInProvidedId = false
  ): ComponentID | undefined {
    const bitId: ComponentID | undefined = this.bitMap.getExistingBitId(id, false, searchWithoutScopeInProvidedId);
    if (!bitId) return undefined;
    if (!useVersionFromBitmap) {
      const version = ComponentID.getVersionFromString(id);
      return bitId.changeVersion(version || LATEST);
    }
    return bitId;
  }

  /**
   * throws a ComponentNotFound exception if not found in the model
   */
  async loadComponentFromModel(id: ComponentID): Promise<Component> {
    if (!id.version) throw new TypeError('consumer.loadComponentFromModel, version is missing from the id');
    const modelComponent: ModelComponent = await this.scope.getModelComponent(id);

    return modelComponent.toConsumerComponent(id.version, this.scope.name, this.scope.objects);
  }

  /**
   * return a component only when it's stored locally.
   * don't go to any remote server and don't throw an exception if the component is not there.
   */
  async loadComponentFromModelIfExist(id: ComponentID): Promise<Component | undefined> {
    if (!id.version) return undefined;
    return this.loadComponentFromModel(id).catch((err) => {
      if (err instanceof ComponentNotFound || err instanceof NoHeadNoVersion) return undefined;
      throw err;
    });
  }

  async loadAllVersionsOfComponentFromModel(id: ComponentID): Promise<Component[]> {
    const modelComponent: ModelComponent = await this.scope.getModelComponent(id);
    const componentsP = modelComponent.listVersions().map(async (versionNum) => {
      return modelComponent.toConsumerComponent(versionNum, this.scope.name, this.scope.objects);
    });
    return Promise.all(componentsP);
  }

  async loadComponentFromModelImportIfNeeded(id: ComponentID, throwIfNotExist = true): Promise<Component> {
    const scopeComponentsImporter = this.scope.scopeImporter;
    const getModelComponent = async (): Promise<ModelComponent> => {
      if (throwIfNotExist) return this.scope.getModelComponent(id);
      const modelComponent = await this.scope.getModelComponentIfExist(id);
      if (modelComponent) return modelComponent;
      await scopeComponentsImporter.importMany({
        ids: new ComponentIdList(id),
        reason: `because this component (${id.toString()}) was missing from the local scope`,
      });
      return this.scope.getModelComponent(id);
    };
    const modelComponent = await getModelComponent();
    if (!id.version) {
      throw new TypeError('consumer.loadComponentFromModelImportIfNeeded, version is missing from the id');
    }

    const compVersion = modelComponent.toComponentVersion(id.version);
    const consumerComp = await compVersion.toConsumer(this.scope.objects);
    return consumerComp;
  }

  async loadComponent(id: ComponentID, loadOpts?: ComponentLoadOptions): Promise<Component> {
    const { components } = await this.loadComponents(ComponentIdList.fromArray([id]), true, loadOpts);
    return components[0];
  }

  async loadComponents(
    ids: ComponentIdList,
    throwOnFailure = true,
    loadOpts?: ComponentLoadOptions
  ): Promise<LoadManyResult> {
    return this.componentLoader.loadMany(ids, throwOnFailure, loadOpts);
  }

  async listComponentsForAutoTagging(modifiedComponents: ComponentIdList): Promise<Component[]> {
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
      version.packageDependencies = sortObjectByKeys(version.packageDependencies);
      version.devPackageDependencies = sortObjectByKeys(version.devPackageDependencies);
      version.peerPackageDependencies = sortObjectByKeys(version.peerPackageDependencies);
      sortOverrides(version.overrides);
      componentFromModel.dependencies.sort();
      componentFromModel.devDependencies.sort();
      componentFromModel.packageDependencies = sortObjectByKeys(componentFromModel.packageDependencies);
      componentFromModel.devPackageDependencies = sortObjectByKeys(componentFromModel.devPackageDependencies);
      componentFromModel.peerPackageDependencies = sortObjectByKeys(componentFromModel.peerPackageDependencies);
      sortOverrides(componentFromModel.overrides);
    }
    function sortOverrides(overrides) {
      if (!overrides) return;
      DEPENDENCIES_FIELDS.forEach((field) => {
        if (overrides[field]) overrides[field] = sortObjectByKeys(overrides[field]);
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

  composeRelativeComponentPath(bitId: ComponentID): PathLinuxRelative {
    const { componentsDefaultDirectory } = this.dirStructure;

    return composeComponentPath(bitId, componentsDefaultDirectory);
  }

  composeComponentPath(bitId: ComponentID): PathOsBasedAbsolute {
    const addToPath = [this.getPath(), this.composeRelativeComponentPath(bitId)];
    logger.debug(`component dir path: ${addToPath.join('/')}`);
    Analytics.addBreadCrumb('composeComponentPath', `component dir path: ${Analytics.hashData(addToPath.join('/'))}`);
    return path.join(...addToPath);
  }

  static _getScopePath(projectPath: PathOsBasedAbsolute, noGit: boolean): PathOsBasedAbsolute {
    const gitDirPath = path.join(projectPath, DOT_GIT_DIR);
    let resolvedScopePath = path.join(projectPath, BIT_HIDDEN_DIR);
    if (!noGit && fs.existsSync(gitDirPath) && !fs.existsSync(resolvedScopePath)) {
      resolvedScopePath = path.join(gitDirPath, BIT_GIT_DIR);
    }
    return resolvedScopePath;
  }

  setPackageJsonWithTypeModule() {
    const exists = this.packageJson && this.packageJson.fileExist;
    if (exists) {
      const content = this.packageJson.packageJsonObject;
      if (content.type === 'module') return;
      logger.console(
        '\nEnable ESM by adding "type":"module" to the package.json file (https://nodejs.org/api/esm.html#enabling). If you are looking to use CJS. Use the Bit CJS environments.'
      );
      return;
    }
    const jsonContent = { type: 'module' };
    const packageJson = PackageJsonFile.create(this.projectPath, undefined, jsonContent);
    this.setPackageJson(packageJson);
  }

  static async ensurePackageJson(projectPath: string) {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const exists = fs.existsSync(packageJsonPath);
    if (exists) {
      const content = await fs.readJson(packageJsonPath);
      if (content.type === 'module') return;
      logger.console(
        '\nEnable ESM by adding "type":"module" to the package.json file (https://nodejs.org/api/esm.html#enabling). If you are looking to use CJS. Use the Bit CJS environments.'
      );
      return;
    }
    const jsonContent = { type: 'module' };
    fs.writeJSONSync(packageJsonPath, jsonContent, { spaces: 2 });
  }

  async resetNew() {
    this.bitMap.resetToNewComponents();
    await Scope.reset(this.scope.path, true);
  }

  async resetLaneNew() {
    this.bitMap.resetLaneComponentsToNew();
    this.bitMap.laneId = undefined;
    await Scope.reset(this.scope.path, true);
  }

  static async load(currentPath: PathOsBasedAbsolute): Promise<Consumer> {
    const consumerInfo = await getConsumerInfo(currentPath);
    if (!consumerInfo) {
      return Promise.reject(new ConsumerNotFound());
    }
    if (!consumerInfo.hasBitMap || !consumerInfo.hasScope || !consumerInfo.hasConsumerConfig) {
      throw new BitError(
        `fatal: unable to load the workspace. workspace.jsonc or .bitmap or local-scope are missing. run "bit init" to generate the missing files`
      );
    }
    const scope = await Scope.load(consumerInfo.path).catch((err) => {
      if (err instanceof ScopeNotFound) {
        throw new BitError(`${err.message}\nplease run "bit init" to re-initialize the local-scope`);
      }
      throw err;
    });
    const config = await WorkspaceConfig.loadIfExist(consumerInfo.path, scope.path);
    const consumer = new Consumer({
      projectPath: consumerInfo.path,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      config,
      scope,
    });
    await consumer.setBitMap();
    scope.currentLaneIdFunc = consumer.getCurrentLaneIdIfExist.bind(consumer);
    scope.notExportedIdsFunc = consumer.getNotExportedIds.bind(consumer);
    logger.commandHistoryBasePath = scope.getPath();
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

  getNotExportedIds(): ComponentIdList {
    return ComponentIdList.fromArray(this.bitmapIdsFromCurrentLane.filter((id) => !id.hasScope()));
  }

  /**
   * whether a component was not exported yet. (new).
   */
  isExported(id: ComponentID) {
    return id.hasScope() && !this.getNotExportedIds().hasWithoutVersion(id);
  }

  /**
   * clean up removed components from bitmap
   */
  async cleanFromBitMap(componentsToRemoveFromFs: ComponentID[]) {
    logger.debug(`consumer.cleanFromBitMap, cleaning ${componentsToRemoveFromFs.length} comps from .bitmap`);
    this.bitMap.removeComponents(componentsToRemoveFromFs);
  }

  async getIdsOfDefaultLane(): Promise<ComponentIdList> {
    const ids = this.bitMap.getAllBitIds();
    const componentIds = await Promise.all(
      ids.map(async (id) => {
        if (!id.hasVersion()) return id;
        const modelComponent = await this.scope.getModelComponentIfExist(id.changeVersion(undefined));
        if (!modelComponent) {
          logger.error(`getIdsOfDefaultLane: model-component of ${id.toString()} is missing`);
          throw new BitError(`${id.toStringWithoutVersion()} is missing, please run "bit import"`);
        }
        const head = modelComponent.getHeadAsTagIfExist();
        if (head) {
          return id.changeVersion(head);
        }
        return undefined;
      })
    );
    return ComponentIdList.fromArray(compact(componentIds));
  }

  async writeBitMap(reasonForChange?: string) {
    await this.backupBitMap(reasonForChange);
    await this.bitMap.write();
  }

  async writePackageJson() {
    if (!isEmpty(this.packageJson.packageJsonObject)) {
      await this.packageJson.write();
    }
  }

  getBitmapHistoryDir(): PathOsBasedAbsolute {
    return path.join(this.scope.path, BITMAP_HISTORY_DIR_NAME);
  }

  getBitmapHistoryMetadataPath() {
    return path.join(this.scope.path, BITMAP_HISTORY_METADATA_FILE_NAME);
  }

  async getParsedBitmapHistoryMetadata(): Promise<{ [fileId: string]: string }> {
    return getParsedHistoryMetadata(this.getBitmapHistoryMetadataPath());
  }

  private async backupBitMap(reasonForBitmapChange?: string) {
    if (!this.bitMap.hasChanged) return;
    try {
      const baseDir = this.getBitmapHistoryDir();
      await fs.ensureDir(baseDir);
      const fileId = currentDateAndTimeToFileName();
      const backupPath = path.join(baseDir, `.bitmap-${fileId}`);
      await fs.copyFile(this.bitMap.mapPath, backupPath);
      const metadataFile = this.getBitmapHistoryMetadataPath();
      await fs.appendFile(metadataFile, `${fileId} ${reasonForBitmapChange || ''}\n`);
    } catch (err: any) {
      if (err.code === 'ENOENT') return; // no such file or directory, meaning the .bitmap file doesn't exist (yet)
      // it's a nice to have feature. don't kill the process if something goes wrong.
      logger.error(`failed to backup bitmap`, err);
    }
  }

  async onDestroy(reasonForBitmapChange?: string) {
    await this.cleanTmpFolder();
    await this.scope.scopeJson.writeIfChanged(this.scope.path);
    await this.writeBitMap(reasonForBitmapChange);
  }
}

export function currentDateAndTimeToFileName() {
  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  return `${year}-${month}-${day}-${hours}-${minutes}-${seconds}`;
}

export async function getParsedHistoryMetadata(metadataPath: string): Promise<{ [fileId: string]: string }> {
  let fileContent: string | undefined;
  try {
    fileContent = await fs.readFile(metadataPath, 'utf-8');
  } catch (err: any) {
    if (err.code === 'ENOENT') return {}; // no such file or directory, meaning the history-metadata file doesn't exist (yet)
  }
  const lines = fileContent?.split('\n') || [];
  const metadata = {};
  lines.forEach((line) => {
    const [fileId, ...reason] = line.split(' ');
    if (!fileId) return;
    metadata[fileId] = reason.join(' ');
  });
  return metadata;
}

/**
 * the following place-holders are permitted:
 * name - component name includes namespace, e.g. 'ui/button'.
 * scopeId - full scope-id includes the owner, e.g. 'teambit.compilation'.
 * scope - scope name only, e.g. 'compilation'.
 * owner - owner name in bit.dev, e.g. 'teambit'.
 */
function composeComponentPath(
  bitId: ComponentID,
  componentsDefaultDirectory: string = DEFAULT_COMPONENTS_DIR_PATH
): PathLinuxRelative {
  let defaultDir = componentsDefaultDirectory;
  const { scope, owner } = parseScope(bitId.scope);
  // Prevent case where for example {scope}/{name} becomes /my-comp (in case the scope is empty)
  if (componentsDefaultDirectory.includes('{scope}/') && !bitId.scope) {
    defaultDir = componentsDefaultDirectory.replace('{scope}/', '');
  }
  if (componentsDefaultDirectory.includes('{scopeId}/') && !bitId.scope) {
    defaultDir = componentsDefaultDirectory.replace('{scopeId}/', '');
  }
  if (componentsDefaultDirectory.includes('{owner}.') && !owner) {
    defaultDir = componentsDefaultDirectory.replace('{owner}.', '');
  }
  if (componentsDefaultDirectory.includes('{owner}/') && !owner) {
    defaultDir = componentsDefaultDirectory.replace('{owner}/', '');
  }
  const result = format(defaultDir, { name: bitId.fullName, scope, owner, scopeId: bitId.scope });
  return result;
}
