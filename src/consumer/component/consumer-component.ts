import fs from 'fs-extra';
import { v4 } from 'uuid';
import * as path from 'path';
import R from 'ramda';
import { IssuesList } from '@teambit/component-issues';
import BitId from '../../bit-id/bit-id';
import BitIds from '../../bit-id/bit-ids';
import {
  getCloudDomain,
  BIT_WORKSPACE_TMP_DIRNAME,
  BuildStatus,
  DEFAULT_BINDINGS_PREFIX,
  DEFAULT_LANGUAGE,
  Extensions,
} from '../../constants';
import GeneralError from '../../error/general-error';
import docsParser from '../../jsdoc/parser';
import { Doclet } from '../../jsdoc/types';
import logger from '../../logger/logger';
import ComponentWithDependencies from '../../scope/component-dependencies';
import { ScopeListItem } from '../../scope/models/model-component';
import Version, { DepEdge, Log } from '../../scope/models/version';
import { pathNormalizeToLinux, sha1 } from '../../utils';
import { PathLinux, PathOsBased, PathOsBasedRelative } from '../../utils/path';
import ComponentMap from '../bit-map/component-map';
import { IgnoredDirectory } from '../component-ops/add-components/exceptions/ignored-directory';
import ComponentsPendingImport from '../component-ops/exceptions/components-pending-import';
import { Dist, License, SourceFile } from '../component/sources';
import ComponentConfig, { ILegacyWorkspaceConfig } from '../config';
import ComponentOverrides from '../config/component-overrides';
import { ExtensionDataList } from '../config/extension-data';
import Consumer from '../consumer';
import ComponentOutOfSync from '../exceptions/component-out-of-sync';
import { ComponentFsCache } from './component-fs-cache';
import { CURRENT_SCHEMA, isSchemaSupport, SchemaFeature, SchemaName } from './component-schema';
import { Dependencies, Dependency } from './dependencies';
import { ManuallyChangedDependencies } from './dependencies/dependency-resolver/overrides-dependencies';
import ComponentNotFoundInPath from './exceptions/component-not-found-in-path';
import MainFileRemoved from './exceptions/main-file-removed';
import MissingFilesFromComponent from './exceptions/missing-files-from-component';
import { NoComponentDir } from './exceptions/no-component-dir';
import PackageJsonFile from './package-json-file';
import DataToPersist from './sources/data-to-persist';
import { ModelComponent } from '../../scope/models';

export type CustomResolvedPath = { destinationPath: PathLinux; importSource: string };

export type InvalidComponent = { id: BitId; error: Error; component: Component | undefined };

export type ComponentProps = {
  name: string;
  version?: string;
  scope?: string | null;
  lang?: string;
  bindingPrefix?: string;
  mainFile: PathOsBased;
  bitJson?: ComponentConfig;
  dependencies?: Dependency[];
  devDependencies?: Dependency[];
  flattenedDependencies?: BitIds;
  flattenedEdges?: DepEdge[];
  packageDependencies?: Record<string, string>;
  devPackageDependencies?: Record<string, string>;
  peerPackageDependencies?: Record<string, string>;
  overrides: ComponentOverrides;
  defaultScope: string | null;
  packageJsonFile?: PackageJsonFile;
  packageJsonChangedProps?: { [key: string]: any };
  files: SourceFile[];
  docs?: Doclet[];
  dists?: Dist[];
  mainDistFile?: PathLinux;
  license?: License;
  deprecated?: boolean;
  removed?: boolean;
  log?: Log;
  schema?: string;
  scopesList?: ScopeListItem[];
  extensions: ExtensionDataList;
  componentFromModel?: Component;
  modelComponent?: ModelComponent;
  buildStatus?: BuildStatus;
};

export default class Component {
  static registerOnComponentConfigLoading(extId, func: (id) => any) {
    ComponentConfig.registerOnComponentConfigLoading(extId, func);
  }

  static registerOnComponentConfigLegacyLoading(extId, func: (id, config) => any) {
    ComponentConfig.registerOnComponentConfigLegacyLoading(extId, func);
  }

  static registerOnComponentOverridesLoading(extId, func: (id, config, legacyFiles) => any) {
    ComponentOverrides.registerOnComponentOverridesLoading(extId, func);
  }

  name: string;
  version: string | undefined;
  previouslyUsedVersion: string | undefined;
  scope: string | null | undefined;
  lang: string;
  bindingPrefix: string;
  mainFile: PathOsBased;
  bitJson: ComponentConfig | undefined;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  dependencies: Dependencies;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  devDependencies: Dependencies;
  flattenedDependencies: BitIds;
  flattenedEdges: DepEdge[];
  packageDependencies: Record<string, string>;
  devPackageDependencies: Record<string, string>;
  peerPackageDependencies: Record<string, string>;
  manuallyRemovedDependencies: ManuallyChangedDependencies = {};
  manuallyAddedDependencies: ManuallyChangedDependencies = {};
  overrides: ComponentOverrides;
  docs: Doclet[] | undefined;
  files: SourceFile[];
  license: License | undefined;
  log: Log | undefined;
  writtenPath?: PathOsBasedRelative; // needed for generate links
  dependenciesSavedAsComponents: boolean | undefined = true; // otherwise they're saved as npm packages.
  loadedFromFileSystem = false; // whether a component was loaded from the filesystem or converted from the model
  schema?: string;
  componentMap: ComponentMap | undefined; // always populated when the loadedFromFileSystem is true
  componentFromModel: Component | undefined; // populated when loadedFromFileSystem is true and it exists in the model
  modelComponent?: ModelComponent; // populated when loadedFromFileSystem is true and it exists in the model
  issues: IssuesList;
  deprecated: boolean;
  private removed?: boolean; // was it soft-removed. to get this data please use isRemoved() method.
  defaultScope: string | null;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  _isModified: boolean;
  packageJsonFile: PackageJsonFile | undefined; // populated when loadedFromFileSystem or when writing the components. for author it never exists
  packageJsonChangedProps: Record<string, any> | undefined; // manually changed or added by the user or by the compiler (currently, it's only populated by the build process). relevant for author also.
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  _currentlyUsedVersion: BitId; // used by listScope functionality
  pendingVersion: Version; // used during tagging process. It's the version that going to be saved or saved already in the model
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  dataToPersist: DataToPersist;
  scopesList: ScopeListItem[] | undefined;
  extensions: ExtensionDataList = new ExtensionDataList();
  _capsuleDir?: string; // @todo: remove this. use CapsulePaths once it's public and available
  buildStatus?: BuildStatus;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get id(): BitId {
    return new BitId({
      scope: this.scope,
      name: this.name,
      version: this.version,
    });
  }

  constructor({
    name,
    version,
    scope,
    files,
    lang,
    bindingPrefix,
    mainFile,
    bitJson,
    dependencies,
    devDependencies,
    flattenedDependencies,
    flattenedEdges,
    packageDependencies,
    devPackageDependencies,
    peerPackageDependencies,
    componentFromModel,
    modelComponent,
    overrides,
    schema,
    defaultScope,
    packageJsonFile,
    packageJsonChangedProps,
    docs,
    license,
    log,
    deprecated,
    removed,
    scopesList,
    extensions,
    buildStatus,
  }: ComponentProps) {
    this.name = name;
    this.version = version;
    this.scope = scope;
    this.files = files;
    this.lang = lang || DEFAULT_LANGUAGE;
    this.bindingPrefix = bindingPrefix || DEFAULT_BINDINGS_PREFIX;
    this.mainFile = path.normalize(mainFile);
    this.bitJson = bitJson;
    this.setDependencies(dependencies);
    this.setDevDependencies(devDependencies);
    this.flattenedDependencies = flattenedDependencies || new BitIds();
    this.flattenedEdges = flattenedEdges || [];
    this.packageDependencies = packageDependencies || {};
    this.devPackageDependencies = devPackageDependencies || {};
    this.peerPackageDependencies = peerPackageDependencies || {};
    this.overrides = overrides;
    this.defaultScope = defaultScope;
    this.packageJsonFile = packageJsonFile;
    this.packageJsonChangedProps = packageJsonChangedProps;
    this.docs = docs || [];
    this.license = license;
    this.log = log;
    this.deprecated = deprecated || false;
    this.removed = removed;
    this.scopesList = scopesList;
    this.extensions = extensions || [];
    this.componentFromModel = componentFromModel;
    this.modelComponent = modelComponent;
    this.schema = schema;
    this.buildStatus = buildStatus;
    this.issues = new IssuesList();
  }

  validateComponent() {
    const nonEmptyFields = ['name', 'mainFile'];
    nonEmptyFields.forEach((field) => {
      if (!this[field]) {
        throw new GeneralError(`failed loading a component ${this.id}, the field "${field}" can't be empty`);
      }
    });
  }

  /**
   * Warning: this method does not return a deep copy for all objects in this class, only for the
   * ones you see in the implementation below.
   * Implement deep copy of other properties if needed
   */
  clone() {
    const newInstance: Component = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    newInstance.setDependencies(this.dependencies.getClone());
    newInstance.setDevDependencies(this.devDependencies.getClone());
    newInstance.overrides = this.overrides.clone();
    newInstance.files = this.files.map((file) => file.clone());
    return newInstance;
  }

  getTmpFolder(workspacePrefix: PathOsBased = ''): PathOsBased {
    let folder = path.join(workspacePrefix, BIT_WORKSPACE_TMP_DIRNAME, this.id.name);
    if (this.componentMap) {
      const componentDir = this.componentMap.getComponentDir();
      if (componentDir) {
        folder = path.join(workspacePrefix, componentDir, BIT_WORKSPACE_TMP_DIRNAME);
      }
    }
    return folder;
  }

  setDependencies(dependencies?: Dependency[]) {
    this.dependencies = new Dependencies(dependencies);
  }

  setDevDependencies(devDependencies?: Dependency[]) {
    this.devDependencies = new Dependencies(devDependencies);
  }

  setNewVersion(version = sha1(v4())) {
    this.previouslyUsedVersion = this.version;
    this.version = version;
  }

  getFileExtension(): string {
    switch (this.lang) {
      case DEFAULT_LANGUAGE:
      default:
        return 'js';
    }
  }

  /**
   * whether the component is soft removed
   */
  isRemoved() {
    return this.extensions.findCoreExtension(Extensions.remove)?.config?.removed || this.removed;
  }

  setRemoved() {
    this.removed = true;
  }

  _getHomepage() {
    // TODO: Validate somehow that this scope is really on bitsrc (maybe check if it contains . ?)
    const homepage = this.scope
      ? `https://${getCloudDomain()}/${this.scope.replace('.', '/')}/${this.name}`
      : undefined;
    return homepage;
  }

  get extensionDependencies() {
    return new Dependencies(this.extensions.extensionsBitIds.map((id) => new Dependency(id, [])));
  }

  getAllDependencies(): Dependency[] {
    return [
      ...this.dependencies.dependencies,
      ...this.devDependencies.dependencies,
      ...this.extensionDependencies.dependencies,
    ];
  }

  getAllDependenciesCloned(): Dependencies {
    const dependencies = [
      ...this.dependencies.getClone(),
      ...this.devDependencies.getClone(),
      ...this.extensionDependencies.getClone(),
    ];
    return new Dependencies(dependencies);
  }

  getAllPackageDependencies() {
    return { ...this.packageDependencies, ...this.devPackageDependencies };
  }

  getAllNonEnvsDependencies(): Dependency[] {
    return [...this.dependencies.dependencies, ...this.devDependencies.dependencies];
  }

  getAllDependenciesIds(): BitIds {
    const allDependencies = R.flatten(Object.values(this.depsIdsGroupedByType));
    return BitIds.fromArray(allDependencies);
  }

  get depsIdsGroupedByType(): { dependencies: BitIds; devDependencies: BitIds; extensionDependencies: BitIds } {
    return {
      dependencies: this.dependencies.getAllIds(),
      devDependencies: this.devDependencies.getAllIds(),
      extensionDependencies: this.extensions.extensionsBitIds,
    };
  }

  hasDependencies(): boolean {
    const allDependencies = this.getAllDependenciesIds();
    return Boolean(allDependencies.length);
  }

  getAllFlattenedDependencies(): BitId[] {
    return [...this.flattenedDependencies];
  }

  /**
   * components added since v14.8.0 have "rootDir" in .bitmap, which is mostly the same as the
   * sharedDir. so, if rootDir is found, no need to strip/add the sharedDir as the files are
   * already relative to the sharedDir rather than the author workspace.
   */
  get ignoreSharedDir(): boolean {
    return !isSchemaSupport(SchemaFeature.sharedDir, this.schema);
  }

  get isLegacy(): boolean {
    return !this.schema || this.schema === SchemaName.Legacy;
  }

  cloneFilesWithSharedDir(): SourceFile[] {
    return this.files.map((file) => {
      const newFile = file.clone();
      const newRelative = pathNormalizeToLinux(file.relative);
      newFile.updatePaths({ newRelative });
      return newFile;
    });
  }

  toObject(): Record<string, any> {
    return {
      name: this.name,
      version: this.version,
      mainFile: this.mainFile,
      scope: this.scope,
      lang: this.lang,
      bindingPrefix: this.bindingPrefix,
      dependencies: this.dependencies.serialize(),
      devDependencies: this.devDependencies.serialize(),
      extensions: this.extensions.map((ext) => {
        const res = Object.assign({}, ext.toComponentObject());
        return res;
      }),
      packageDependencies: this.packageDependencies,
      devPackageDependencies: this.devPackageDependencies,
      peerPackageDependencies: this.peerPackageDependencies,
      manuallyRemovedDependencies: this.manuallyRemovedDependencies,
      manuallyAddedDependencies: this.manuallyAddedDependencies,
      overrides: this.overrides.componentOverridesData,
      files: this.files,
      docs: this.docs,
      schema: this.schema,
      license: this.license ? this.license.serialize() : null,
      log: this.log,
      deprecated: this.deprecated,
    };
  }

  toString(): string {
    return JSON.stringify(this.toObject());
  }

  static isComponentInvalidByErrorType(err: Error): boolean {
    const invalidComponentErrors = [
      MainFileRemoved,
      MissingFilesFromComponent,
      ComponentNotFoundInPath,
      ComponentOutOfSync,
      ComponentsPendingImport,
      NoComponentDir,
      IgnoredDirectory,
    ];
    return invalidComponentErrors.some((errorType) => err instanceof errorType);
  }

  async toComponentWithDependencies(consumer: Consumer): Promise<ComponentWithDependencies> {
    const getFlatten = (field: string): BitIds => {
      // when loaded from filesystem, it doesn't have the flatten, fetch them from model.
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return this.loadedFromFileSystem ? this.componentFromModel[field] : this[field];
    };
    const getDependenciesComponents = (ids: BitIds): Promise<Component[]> => {
      return Promise.all(
        ids.map((dependencyId) => {
          if (consumer.bitMap.isExistWithSameVersion(dependencyId)) {
            return consumer.loadComponent(dependencyId);
          }
          // when dependencies are imported as npm packages, they are not in bit.map
          this.dependenciesSavedAsComponents = false;
          return consumer.loadComponentFromModel(dependencyId);
        })
      );
    };

    const dependencies = await getDependenciesComponents(getFlatten('flattenedDependencies'));
    return new ComponentWithDependencies({
      component: this,
      dependencies,
      devDependencies: [],
      extensionDependencies: [],
    });
  }

  copyAllDependenciesFromModel() {
    const componentFromModel = this.componentFromModel;
    if (!componentFromModel) throw new Error('copyDependenciesFromModel: component is missing from the model');
    this.setDependencies(componentFromModel.dependencies.get());
    this.setDevDependencies(componentFromModel.devDependencies.get());
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  static async fromObject(object: Record<string, any>): Component {
    const {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      name,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      box,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      version,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      scope,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      lang,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      bindingPrefix,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      dependencies,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      devDependencies,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      packageDependencies,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      devPackageDependencies,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      peerPackageDependencies,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      docs,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      mainFile,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      files,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      license,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      overrides,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      deprecated,
      schema,
    } = object;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new Component({
      name: box ? `${box}/${name}` : name,
      version,
      scope,
      lang,
      bindingPrefix,
      dependencies,
      devDependencies,
      packageDependencies,
      devPackageDependencies,
      peerPackageDependencies,
      mainFile,
      files,
      docs,
      license: license ? License.deserialize(license) : undefined,
      overrides: new ComponentOverrides(overrides),
      deprecated: deprecated || false,
      schema,
    });
  }

  static async fromString(str: string): Promise<Component> {
    const object = JSON.parse(str);
    object.files = SourceFile.loadFromParsedStringArray(object.files);

    // added if statement to support new and old version of remote ls
    // old version of bit returns from server array of dists  and new version return object
    if (object.dists && Array.isArray(object.dists)) {
      object.dists = Dist.loadFromParsedStringArray(object.dists);
    } else if (object.dists && object.dists.dists) {
      object.dists = Dist.loadFromParsedStringArray(object.dists.dists);
    }
    return this.fromObject(object);
  }

  static async loadFromFileSystem({
    componentMap,
    id,
    consumer,
  }: {
    componentMap: ComponentMap;
    id: BitId;
    consumer: Consumer;
  }): Promise<Component> {
    const workspaceConfig: ILegacyWorkspaceConfig = consumer.config;
    const modelComponent = await consumer.scope.getModelComponentIfExist(id);
    const componentFromModel = await consumer.loadComponentFromModelIfExist(id);
    if (!componentFromModel && id.scope) {
      const inScopeWithAnyVersion = await consumer.scope.getModelComponentIfExist(id.changeVersion(undefined));
      // if it's in scope with another version, the component will be synced in _handleOutOfSyncScenarios()
      if (!inScopeWithAnyVersion) throw new ComponentsPendingImport([id.toString()]);
    }
    const deprecated = componentFromModel ? componentFromModel.deprecated : false;
    const compDirAbs = path.join(consumer.getPath(), componentMap.getComponentDir());
    if (!fs.existsSync(compDirAbs)) throw new ComponentNotFoundInPath(compDirAbs);

    // Load the base entry from the root dir in map file in case it was imported using -path
    // Or created using bit create so we don't want all the path but only the relative one
    // Check that bitDir isn't the same as consumer path to make sure we are not loading global stuff into component
    // (like dependencies)
    logger.trace(`consumer-component.loadFromFileSystem, start loading config ${id.toString()}`);
    const componentConfig = await ComponentConfig.load({
      componentId: id,
    });
    logger.trace(`consumer-component.loadFromFileSystem, finish loading config ${id.toString()}`);
    // by default, imported components are not written with bit.json file.
    // use the component from the model to get their bit.json values
    if (componentFromModel) {
      componentConfig.mergeWithComponentData(componentFromModel);
    }

    const extensions: ExtensionDataList = componentConfig.extensions;

    // TODO: change this once we want to support change export by changing the default scope
    // TODO: when we do this, we need to think how we distinct if this is the purpose of the user, or he just didn't changed it
    const bindingPrefix = componentFromModel?.bindingPrefix || componentConfig.bindingPrefix || DEFAULT_BINDINGS_PREFIX;

    const overridesFromModel = componentFromModel ? componentFromModel.overrides.componentOverridesData : undefined;
    const files = await getLoadedFiles(consumer, componentMap, id, compDirAbs);

    const overrides = await ComponentOverrides.loadFromConsumer(
      id,
      workspaceConfig,
      overridesFromModel,
      componentConfig,
      files
    );
    const packageJsonFile = (componentConfig && componentConfig.packageJsonFile) || undefined;
    const packageJsonChangedProps = componentFromModel ? componentFromModel.packageJsonChangedProps : undefined;
    const docsP = _getDocsForFiles(files, consumer.componentFsCache);
    const docs = await Promise.all(docsP);
    const flattenedDocs = docs ? R.flatten(docs) : [];
    const defaultScope = componentConfig.defaultScope || null;
    const getSchema = () => {
      if (componentFromModel) return componentFromModel.schema;
      return consumer.isLegacy ? undefined : CURRENT_SCHEMA;
    };

    return new Component({
      name: id.name,
      scope: id.scope,
      version: id.version,
      lang: componentConfig.lang,
      bindingPrefix,
      bitJson: componentConfig,
      mainFile: componentMap.mainFile,
      files,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      loadedFromFileSystem: true,
      componentFromModel,
      modelComponent,
      componentMap,
      docs: flattenedDocs,
      deprecated,
      overrides,
      schema: getSchema(),
      defaultScope,
      packageJsonFile,
      packageJsonChangedProps,
      extensions,
      buildStatus: componentFromModel ? componentFromModel.buildStatus : undefined,
    });
  }
}

async function getLoadedFiles(
  consumer: Consumer,
  componentMap: ComponentMap,
  id: BitId,
  bitDir: string
): Promise<SourceFile[]> {
  if (componentMap.noFilesError) {
    logger.error(`rethrowing an error of ${componentMap.noFilesError.message}`);
    throw componentMap.noFilesError;
  }
  await componentMap.trackDirectoryChangesHarmony(consumer, id);
  const sourceFiles = componentMap.files.map((file) => {
    const filePath = path.join(bitDir, file.relativePath);
    const sourceFile = SourceFile.load(filePath, bitDir, consumer.getPath(), {
      test: file.test,
    });
    return sourceFile;
  });
  const filePaths = componentMap.getAllFilesPaths();
  if (!filePaths.includes(componentMap.mainFile)) {
    throw new MainFileRemoved(componentMap.mainFile, id.toString());
  }
  return sourceFiles;
}

function _getDocsForFiles(files: SourceFile[], componentFsCache: ComponentFsCache): Array<Promise<Doclet[]>> {
  return files.map((file) => (file.test ? Promise.resolve([]) : docsParser(file, componentFsCache)));
}
