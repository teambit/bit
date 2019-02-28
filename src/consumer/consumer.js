/** @flow */
import path from 'path';
import semver from 'semver';
import groupArray from 'group-array';
import fs from 'fs-extra';
import R from 'ramda';
import chalk from 'chalk';
import format from 'string-format';
import partition from 'lodash.partition';
import { locateConsumer, pathHasConsumer, pathHasBitMap } from './consumer-locator';
import { ConsumerAlreadyExists, ConsumerNotFound, MissingDependencies } from './exceptions';
import { Driver } from '../driver';
import DriverNotFound from '../driver/exceptions/driver-not-found';
import ConsumerBitJson from './bit-json/consumer-bit-json';
import { BitId, BitIds } from '../bit-id';
import Component from './component';
import {
  BIT_HIDDEN_DIR,
  COMPONENT_ORIGINS,
  BIT_VERSION,
  NODE_PATH_COMPONENT_SEPARATOR,
  LATEST_BIT_VERSION,
  BIT_GIT_DIR,
  DOT_GIT_DIR,
  BIT_WORKSPACE_TMP_DIRNAME
} from '../constants';
import { Scope, ComponentWithDependencies } from '../scope';
import migratonManifest from './migrations/consumer-migrator-manifest';
import migrate from './migrations/consumer-migrator';
import type { ConsumerMigrationResult } from './migrations/consumer-migrator';
import enrichContextFromGlobal from '../hooks/utils/enrich-context-from-global';
import loader from '../cli/loader';
import { BEFORE_MIGRATION } from '../cli/loader/loader-messages';
import BitMap from './bit-map/bit-map';
import { MissingBitMapComponent } from './bit-map/exceptions';
import logger from '../logger/logger';
import DirStructure from './dir-structure/dir-structure';
import { pathNormalizeToLinux, sortObject } from '../utils';
import type { ModelComponent } from '../scope/models';
import { Version } from '../scope/models';
import MissingFilesFromComponent from './component/exceptions/missing-files-from-component';
import ComponentNotFoundInPath from './component/exceptions/component-not-found-in-path';
import { RemovedLocalObjects } from '../scope/removed-components';
import * as packageJson from './component/package-json';
import { Dependencies } from './component/dependencies';
import CompilerExtension from '../extensions/compiler-extension';
import TesterExtension from '../extensions/tester-extension';
import type { PathOsBased, PathRelative, PathAbsolute, PathOsBasedAbsolute, PathOsBasedRelative } from '../utils/path';
import { Analytics } from '../analytics/analytics';
import GeneralError from '../error/general-error';
import tagModelComponent from '../scope/component-ops/tag-model-component';
import type { InvalidComponent } from './component/consumer-component';
import type { BitIdStr } from '../bit-id/bit-id';
import { getAutoTagPending } from '../scope/component-ops/auto-tag';
import { ComponentNotFound } from '../scope/exceptions';
import VersionDependencies from '../scope/version-dependencies';
import ComponentVersion from '../scope/component-version';
import {
  getManipulateDirWhenImportingComponents,
  getManipulateDirForExistingComponents
} from './component-ops/manipulate-dir';
import ComponentLoader from './component/component-loader';
import { getScopeRemotes } from '../scope/scope-remotes';
import ScopeComponentsImporter from '../scope/component-ops/scope-components-importer';
import installExtensions from '../scope/extensions/install-extensions';
import type { Remotes } from '../remotes';
import ComponentOutOfSync from './exceptions/component-out-of-sync';

type ConsumerProps = {
  projectPath: string,
  bitJson: ConsumerBitJson,
  scope: Scope,
  created?: boolean,
  isolated?: boolean,
  bitMap: BitMap,
  addedGitHooks?: ?(string[]),
  existingGitHooks: ?(string[])
};

type ComponentStatus = {
  modified: boolean,
  newlyCreated: boolean,
  deleted: boolean,
  staged: boolean,
  notExist: boolean,
  nested: boolean // when a component is nested, it doesn't matter whether it was modified
};

export default class Consumer {
  projectPath: PathOsBased;
  created: boolean;
  bitJson: ConsumerBitJson;
  scope: Scope;
  bitMap: BitMap;
  isolated: boolean = false; // Mark that the consumer instance is of isolated env and not real
  addedGitHooks: ?(string[]); // list of git hooks added during init process
  existingGitHooks: ?(string[]); // list of git hooks already exists during init process
  _driver: Driver;
  _dirStructure: DirStructure;
  _componentsStatusCache: Object = {}; // cache loaded components
  packageManagerArgs: string[] = []; // args entered by the user in the command line after '--'
  componentLoader: ComponentLoader;

  constructor({
    projectPath,
    bitJson,
    scope,
    created = false,
    isolated = false,
    bitMap,
    addedGitHooks,
    existingGitHooks
  }: ConsumerProps) {
    this.projectPath = projectPath;
    this.bitJson = bitJson;
    this.created = created;
    this.isolated = isolated;
    this.scope = scope;
    this.bitMap = bitMap || BitMap.load(projectPath);
    this.addedGitHooks = addedGitHooks;
    this.existingGitHooks = existingGitHooks;
    this.warnForMissingDriver();
    this.componentLoader = ComponentLoader.getInstance(this);
  }
  get compiler(): Promise<?CompilerExtension> {
    return this.bitJson.loadCompiler(this.projectPath, this.scope.getPath());
  }

  get tester(): Promise<?TesterExtension> {
    return this.bitJson.loadTester(this.projectPath, this.scope.getPath());
  }

  get driver(): Driver {
    if (!this._driver) {
      this._driver = Driver.load(this.bitJson.lang);
    }
    return this._driver;
  }

  get dirStructure(): DirStructure {
    if (!this._dirStructure) {
      this._dirStructure = new DirStructure(
        this.bitJson.componentsDefaultDirectory,
        this.bitJson.dependenciesDirectory,
        this.bitJson.ejectedEnvsDirectory
      );
    }
    return this._dirStructure;
  }

  get bitmapIds(): BitIds {
    return this.bitMap.getAllBitIds();
  }

  getTmpFolder(fullPath: boolean = false): PathOsBased {
    if (!fullPath) {
      return BIT_WORKSPACE_TMP_DIRNAME;
    }
    return path.join(this.getPath(), BIT_WORKSPACE_TMP_DIRNAME);
  }

  async cleanTmpFolder() {
    const tmpPath = this.getTmpFolder(true);
    const exists = await fs.exists(tmpPath);
    if (exists) {
      logger.info(`consumer.cleanTmpFolder, deleting ${tmpPath}`);
      return fs.remove(tmpPath);
    }
    return null;
  }

  /**
   * Check if the driver installed and print message if not
   *
   *
   * @param {any} msg msg to print in case the driver not found (use string-format with the err context)
   * @returns {boolean} true if the driver exists, false otherwise
   * @memberof Consumer
   */
  warnForMissingDriver(msg?: string): boolean {
    try {
      this.driver.getDriver(false);
      return true;
    } catch (err) {
      msg = msg
        ? format(msg, err)
        : `Warning: Bit is not able to run the link command. Please install bit-${
          err.lang
        } driver and run the link command.`;
      if (err instanceof DriverNotFound) {
        console.log(chalk.yellow(msg)); // eslint-disable-line
      }
      throw new GeneralError(
        `Failed loading the driver for ${this.bitJson.lang}. Got an error from the driver: ${err}`
      );
    }
  }

  /**
   * Running migration process for consumer to update the stores (.bit.map.json) to the current version
   *
   * @param {any} verbose - print debug logs
   * @returns {Object} - wether the process run and wether it successeded
   * @memberof Consumer
   */
  async migrate(verbose): Object {
    // Check version of stores (bitmap / bitjson) to check if we need to run migrate
    // If migration is needed add loader - loader.start(BEFORE_MIGRATION);
    // bitmap migrate
    if (verbose) console.log('running migration process for consumer'); // eslint-disable-line
    // We start to use this process after version 0.10.9, so we assume the scope is in the last production version
    const bitmapVersion = this.bitMap.version || '0.10.9';

    if (semver.gte(bitmapVersion, BIT_VERSION)) {
      logger.debug('bit.map version is up to date');
      return {
        run: false
      };
    }
    loader.start(BEFORE_MIGRATION);
    logger.debugAndAddBreadCrumb(
      'consumer.migrate',
      `start consumer migration. bitmapVersion version ${bitmapVersion}, bit version ${BIT_VERSION}`
    );

    const result: ConsumerMigrationResult = await migrate(bitmapVersion, migratonManifest, this.bitMap, verbose);
    result.bitMap.version = BIT_VERSION;
    // mark the bitmap as changed to make sure it persist to FS
    result.bitMap.markAsChanged();
    // Update the version of the bitmap instance of the consumer (to prevent duplicate migration)
    this.bitMap.version = result.bitMap.version;
    await result.bitMap.write();

    loader.stop();

    return {
      run: true,
      success: true
    };
  }

  async write({ overrideBitJson = false }: { overrideBitJson: boolean }): Promise<Consumer> {
    await Promise.all([
      this.bitJson.write({ bitDir: this.projectPath, throws: false, override: overrideBitJson }),
      this.scope.ensureDir()
    ]);
    this.bitMap.markAsChanged();
    await this.bitMap.write();
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

  getParsedId(id: BitIdStr): BitId {
    // $FlowFixMe, bitId is always defined as shouldThrow is true
    const bitId: BitId = this.bitMap.getExistingBitId(id);
    const version = BitId.getVersionOnlyFromString(id);
    return bitId.changeVersion(version);
  }

  getParsedIdIfExist(id: BitIdStr): ?BitId {
    const bitId: ?BitId = this.bitMap.getExistingBitId(id, false);
    if (!bitId) return null;
    const version = BitId.getVersionOnlyFromString(id);
    return bitId.changeVersion(version);
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
  async loadComponentFromModelIfExist(id: BitId): Promise<?Component> {
    if (!id.version) return null;
    return this.loadComponentFromModel(id).catch((err) => {
      if (err instanceof ComponentNotFound) return null;
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

  async loadComponentWithDependenciesFromModel(id: BitId): Promise<ComponentWithDependencies> {
    const modelComponent: ModelComponent = await this.scope.getModelComponent(id);
    if (!id.version) {
      throw new TypeError('consumer.loadComponentWithDependenciesFromModel, version is missing from the id');
    }
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(this.scope);
    const versionDependencies = await scopeComponentsImporter.componentToVersionDependencies(modelComponent, id);
    const manipulateDirData = await getManipulateDirForExistingComponents(this, versionDependencies.component);
    return versionDependencies.toConsumer(this.scope.objects, manipulateDirData);
  }

  async loadComponent(id: BitId): Promise<Component> {
    const { components } = await this.loadComponents(BitIds.fromArray([id]));
    return components[0];
  }

  async loadComponents(
    ids: BitIds,
    throwOnFailure: boolean = true
  ): Promise<{ components: Component[], invalidComponents: InvalidComponent[] }> {
    return this.componentLoader.loadMany(ids, throwOnFailure);
  }

  importEnvironment(bitId: BitId, verbose?: boolean, dontPrintEnvMsg: boolean): Promise<ComponentWithDependencies[]> {
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
      versionDependenciesArr.map(v => v.component.id),
      saveDependenciesAsComponents
    );
    const manipulateDirData = await getManipulateDirWhenImportingComponents(
      this.bitMap,
      versionDependenciesArr,
      this.scope.objects,
      shouldDependenciesSavedAsComponents
    );
    const componentWithDependencies = await Promise.all(
      versionDependenciesArr.map(versionDependencies =>
        versionDependencies.toConsumer(this.scope.objects, manipulateDirData)
      )
    );
    componentWithDependencies.forEach((componentWithDeps) => {
      const shouldSavedAsComponents = shouldDependenciesSavedAsComponents.find(c =>
        c.id.isEqual(componentWithDeps.component.id)
      );
      if (!shouldSavedAsComponents) {
        throw new Error(`saveDependenciesAsComponents is missing for ${componentWithDeps.component.id.toString()}`);
      }
      componentWithDeps.component.dependenciesSavedAsComponents = shouldSavedAsComponents.saveDependenciesAsComponents;
    });
    return componentWithDependencies;
  }

  async shouldDependenciesSavedAsComponents(bitIds: BitId[], saveDependenciesAsComponents?: boolean) {
    if (saveDependenciesAsComponents === undefined) {
      saveDependenciesAsComponents = this.bitJson.saveDependenciesAsComponents;
    }
    const remotes: Remotes = await getScopeRemotes(this.scope);
    const shouldDependenciesSavedAsComponents = bitIds.map((bitId: BitId) => {
      return {
        id: bitId, // if it doesn't go to the hub, it can't import dependencies as packages
        saveDependenciesAsComponents: saveDependenciesAsComponents || !remotes.isHub(bitId.scope)
      };
    });
    return shouldDependenciesSavedAsComponents;
  }

  /**
   * By default, the dists paths are inside the component.
   * If dist attribute is populated in bit.json, the paths are in consumer-root/dist-target.
   */
  shouldDistsBeInsideTheComponent(): boolean {
    return !this.bitJson.distEntry && !this.bitJson.distTarget;
  }

  potentialComponentsForAutoTagging(modifiedComponents: BitIds): BitIds {
    const candidateComponents = this.bitMap.getAuthoredAndImportedBitIds();
    const modifiedComponentsWithoutVersions = modifiedComponents.map(modifiedComponent =>
      modifiedComponent.toStringWithoutVersion()
    );
    // if a modified component is in candidates array, remove it from the array as it will be already tagged with the
    // correct version
    const idsWithoutModified = candidateComponents.filter(
      component => !modifiedComponentsWithoutVersions.includes(component.toStringWithoutVersion())
    );
    return BitIds.fromArray(idsWithoutModified);
  }

  async listComponentsForAutoTagging(modifiedComponents: BitIds): Promise<ModelComponent[]> {
    const candidateComponents = this.potentialComponentsForAutoTagging(modifiedComponents);
    return getAutoTagPending(this.scope, candidateComponents, modifiedComponents);
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
      const { version } = await this.scope.sources.consumerComponentToVersion({
        consumer: this,
        consumerComponent: componentFromFileSystem,
        versionFromModel: componentFromModel
      });

      version.log = componentFromModel.log; // ignore the log, it's irrelevant for the comparison

      // sometime dependencies from the FS don't have an exact version.
      const copyDependenciesVersionsFromModelToFS = (dependenciesFS: Dependencies, dependenciesModel: Dependencies) => {
        dependenciesFS.get().forEach((dependency) => {
          const idWithoutVersion = dependency.id.toStringWithoutVersion();
          const dependencyFromModel = dependenciesModel
            .get()
            .find(modelDependency => modelDependency.id.toStringWithoutVersion() === idWithoutVersion);
          if (dependencyFromModel && !dependency.id.hasVersion()) {
            dependency.id = dependencyFromModel.id;
          }
        });
      };
      copyDependenciesVersionsFromModelToFS(version.dependencies, componentFromModel.dependencies);
      copyDependenciesVersionsFromModelToFS(version.devDependencies, componentFromModel.devDependencies);
      copyDependenciesVersionsFromModelToFS(version.compilerDependencies, componentFromModel.compilerDependencies);
      copyDependenciesVersionsFromModelToFS(version.testerDependencies, componentFromModel.testerDependencies);

      // sort the files by 'relativePath' because the order can be changed when adding or renaming
      // files in bitmap, which affects later on the model.
      version.files = R.sortBy(R.prop('relativePath'), version.files);
      componentFromModel.files = R.sortBy(R.prop('relativePath'), componentFromModel.files);

      version.packageDependencies = sortObject(version.packageDependencies);
      version.devPackageDependencies = sortObject(version.devPackageDependencies);
      version.compilerPackageDependencies = sortObject(version.compilerPackageDependencies);
      version.testerPackageDependencies = sortObject(version.testerPackageDependencies);
      version.peerPackageDependencies = sortObject(version.peerPackageDependencies);
      componentFromModel.packageDependencies = sortObject(componentFromModel.packageDependencies);
      componentFromModel.devPackageDependencies = sortObject(componentFromModel.devPackageDependencies);
      componentFromModel.compilerPackageDependencies = sortObject(componentFromModel.compilerPackageDependencies);
      componentFromModel.testerPackageDependencies = sortObject(componentFromModel.testerPackageDependencies);
      componentFromModel.peerPackageDependencies = sortObject(componentFromModel.peerPackageDependencies);
      // prefix your command with "BIT_LOG=*" to see the actual id changes
      if (process.env.BIT_LOG && componentFromModel.hash().hash !== version.hash().hash) {
        console.log('-------------------componentFromModel------------------------'); // eslint-disable-line no-console
        console.log(componentFromModel.id()); // eslint-disable-line no-console
        console.log('------------------------componentFromFileSystem (version)----'); // eslint-disable-line no-console
        console.log(version.id()); // eslint-disable-line no-console
        console.log('-------------------------END---------------------------------'); // eslint-disable-line no-console
      }
      componentFromFileSystem._isModified = componentFromModel.hash().hash !== version.hash().hash;
    }
    return componentFromFileSystem._isModified;
  }

  /**
   * Get a component status by ID. Return a ComponentStatus object.
   * Keep in mind that a result can be a partial object of ComponentStatus, e.g. { notExist: true }.
   * Each one of the ComponentStatus properties can be undefined, true or false.
   * As a result, in order to check whether a component is not modified use (status.modified === false).
   * Don't use (!status.modified) because a component may not exist and the status.modified will be undefined.
   *
   * The status may have 'true' for several properties. For example, a component can be staged and modified at the
   * same time.
   *
   * The result is cached per ID and can be called several times with no penalties.
   */
  async getComponentStatusById(id: BitId): Promise<ComponentStatus> {
    const getStatus = async () => {
      const status: ComponentStatus = {};
      const componentFromModel: ?ModelComponent = await this.scope.getModelComponentIfExist(id);
      let componentFromFileSystem;
      try {
        componentFromFileSystem = await this.loadComponent(id.changeVersion(null));
      } catch (err) {
        if (
          err instanceof MissingFilesFromComponent ||
          err instanceof ComponentNotFoundInPath ||
          err instanceof MissingBitMapComponent
        ) {
          // the file/s have been deleted or the component doesn't exist in bit.map file
          if (componentFromModel) status.deleted = true;
          else status.notExist = true;
          return status;
        }
        throw err;
      }
      if (componentFromFileSystem.componentMap.origin === COMPONENT_ORIGINS.NESTED) {
        status.nested = true;
        return status;
      }
      if (!componentFromModel) {
        status.newlyCreated = true;
        return status;
      }

      status.staged = componentFromModel.isLocallyChanged();
      const versionFromFs = componentFromFileSystem.id.version;
      const idStr = id.toString();
      if (!componentFromFileSystem.id.hasVersion()) {
        throw new ComponentOutOfSync(idStr);
      }
      // TODO: instead of doing that like this we should use:
      // const versionFromModel = await componentFromModel.loadVersion(versionFromFs, this.scope.objects);
      // it looks like it's exactly the same code but it's not working from some reason
      const versionRef = componentFromModel.versions[versionFromFs];
      if (!versionRef) throw new GeneralError(`version ${versionFromFs} was not found in ${idStr}`);
      const versionFromModel = await this.scope.getObject(versionRef.hash);
      if (!versionFromModel) {
        throw new GeneralError(`failed loading version ${versionFromFs} of ${idStr} from the scope`);
      }
      status.modified = await this.isComponentModified(versionFromModel, componentFromFileSystem);
      return status;
    };
    if (!this._componentsStatusCache[id.toString()]) {
      this._componentsStatusCache[id.toString()] = await getStatus();
    }
    return this._componentsStatusCache[id.toString()];
  }

  async tag(
    ids: BitIds,
    message: string,
    exactVersion: ?string,
    releaseType: string,
    force: ?boolean,
    verbose: ?boolean,
    ignoreUnresolvedDependencies: ?boolean,
    ignoreNewestVersion: boolean,
    skipTests: boolean = false
  ): Promise<{ taggedComponents: Component[], autoTaggedComponents: ModelComponent[] }> {
    logger.debug(`tagging the following components: ${ids.toString()}`);
    Analytics.addBreadCrumb('tag', `tagging the following components: ${Analytics.hashData(ids)}`);
    const { components } = await this.loadComponents(ids);
    // go through the components list to check if there are missing dependencies
    // if there is at least one we won't tag anything
    if (!ignoreUnresolvedDependencies) {
      const componentsWithMissingDeps = components.filter((component) => {
        return Boolean(component.issues);
      });
      if (!R.isEmpty(componentsWithMissingDeps)) throw new MissingDependencies(componentsWithMissingDeps);
    }

    const { taggedComponents, autoTaggedComponents } = await tagModelComponent({
      consumerComponents: components,
      scope: this.scope,
      message,
      exactVersion,
      releaseType,
      force,
      consumer: this,
      ignoreNewestVersion,
      skipTests,
      verbose
    });

    // update bitmap with the new version
    const taggedComponentIds = taggedComponents.map((component: Component) => {
      this.bitMap.updateComponentId(component.id);
      const { detachedCompiler, detachedTester } = component.pendingVersion;
      this.bitMap.setDetachedCompilerAndTester(component.id, { detachedCompiler, detachedTester });
      return component.id;
    });
    const autoTaggedComponentIds = autoTaggedComponents.map((component: ModelComponent) => {
      const id = component.toBitId();
      const newId = id.changeVersion(component.latest());
      this.bitMap.updateComponentId(newId);
      return newId;
    });

    // update package.json with the new version
    const allComponentIds = taggedComponentIds.concat(autoTaggedComponentIds);
    const updatePackageJsonP = allComponentIds.map((componentId: BitId) => {
      const componentMap = this.bitMap.getComponent(componentId);
      if (componentMap.rootDir) {
        return packageJson.updateAttribute(this, componentMap.rootDir, 'version', componentId.version);
      }
      return null;
    });

    await Promise.all(updatePackageJsonP);
    return { taggedComponents, autoTaggedComponents };
  }

  getComponentIdFromNodeModulesPath(requirePath: string, bindingPrefix: string): BitId {
    requirePath = pathNormalizeToLinux(requirePath);
    // Temp fix to support old components before the migration has been running
    bindingPrefix = bindingPrefix === 'bit' ? '@bit' : bindingPrefix;
    const prefix = requirePath.includes('node_modules') ? `node_modules/${bindingPrefix}/` : `${bindingPrefix}/`;
    const withoutPrefix = requirePath.substr(requirePath.indexOf(prefix) + prefix.length);
    const componentName = withoutPrefix.includes('/')
      ? withoutPrefix.substr(0, withoutPrefix.indexOf('/')) // the part after the first slash is the path inside the package
      : withoutPrefix;
    const pathSplit = componentName.split(NODE_PATH_COMPONENT_SEPARATOR);
    if (pathSplit.length < 2) throw new GeneralError(`component has an invalid require statement: ${requirePath}`);
    // since the dynamic namespaces feature introduced, the require statement doesn't have a fixed
    // number of separators.
    // also, a scope name may or may not include a dot. depends whether it's on bitHub or self hosted.
    // we must check against BitMap to get the correct scope and name of the id.
    if (pathSplit.length === 2) {
      return new BitId({ scope: pathSplit[0], name: pathSplit[1] });
    }
    const mightBeScope = R.head(pathSplit);
    const mightBeName = R.tail(pathSplit).join('/');
    const mightBeId = new BitId({ scope: mightBeScope, name: mightBeName });
    const allBitIds = this.bitMap.getAllBitIds();
    if (allBitIds.searchWithoutVersion(mightBeId)) return mightBeId;
    // only bit hub has the concept of having the username in the scope name.
    if (bindingPrefix !== 'bit' && bindingPrefix !== '@bit') return mightBeId;
    // pathSplit has 3 or more items. the first two are the scope, the rest is the name.
    // for example "user.scopeName.utils.is-string" => scope: user.scopeName, name: utils/is-string
    const scope = pathSplit.splice(0, 2).join('.');
    const name = pathSplit.join('/');
    return new BitId({ scope, name });
  }

  composeRelativeComponentPath(bitId: BitId): string {
    const componentsDefaultDirectory = this.dirStructure.componentsDefaultDirectory;
    return format(componentsDefaultDirectory, { name: bitId.name, scope: bitId.scope });
  }

  composeComponentPath(bitId: BitId): PathOsBasedAbsolute {
    const addToPath = [this.getPath(), this.composeRelativeComponentPath(bitId)];
    logger.debug(`component dir path: ${addToPath.join('/')}`);
    Analytics.addBreadCrumb('composeComponentPath', `component dir path: ${Analytics.hashData(addToPath.join('/'))}`);
    return path.join(...addToPath);
  }

  composeRelativeDependencyPath(bitId: BitId): PathOsBased {
    const dependenciesDir = this.dirStructure.dependenciesDirStructure;
    return path.join(dependenciesDir, bitId.toFullPath());
  }

  composeDependencyPath(bitId: BitId): PathOsBased {
    const relativeDependencyPath = this.composeRelativeDependencyPath(bitId);
    return path.join(this.getPath(), relativeDependencyPath);
  }

  static create(projectPath: PathOsBasedAbsolute, noGit: boolean = false): Promise<Consumer> {
    return this.ensure(projectPath, noGit);
  }

  static _getScopePath(projectPath: PathOsBasedAbsolute, noGit: boolean): PathOsBasedAbsolute {
    const gitDirPath = path.join(projectPath, DOT_GIT_DIR);
    let resolvedScopePath = path.join(projectPath, BIT_HIDDEN_DIR);
    if (!noGit && fs.existsSync(gitDirPath) && !fs.existsSync(resolvedScopePath)) {
      resolvedScopePath = path.join(gitDirPath, BIT_GIT_DIR);
    }
    return resolvedScopePath;
  }

  static async ensure(projectPath: PathOsBasedAbsolute, noGit: boolean = false): Promise<Consumer> {
    const resolvedScopePath = Consumer._getScopePath(projectPath, noGit);
    let existingGitHooks;
    const bitMap = BitMap.load(projectPath);
    const scopeP = Scope.ensure(resolvedScopePath);
    const bitJsonP = ConsumerBitJson.ensure(projectPath);
    const [scope, bitJson] = await Promise.all([scopeP, bitJsonP]);
    return new Consumer({
      projectPath,
      created: true,
      scope,
      bitJson,
      bitMap,
      existingGitHooks
    });
  }

  /**
   * if resetHard, delete consumer-files: bitMap and bit.json and also the local scope (.bit dir).
   * otherwise, delete the consumer-files only when they are corrupted
   */
  static async reset(projectPath: PathOsBasedAbsolute, resetHard: boolean, noGit: boolean = false): Promise<void> {
    const resolvedScopePath = Consumer._getScopePath(projectPath, noGit);
    BitMap.reset(projectPath, resetHard);
    const scopeP = Scope.reset(resolvedScopePath, resetHard);
    const bitJsonP = ConsumerBitJson.reset(projectPath, resetHard);
    await Promise.all([scopeP, bitJsonP]);
  }

  static async createWithExistingScope(
    consumerPath: PathOsBased,
    scope: Scope,
    isolated: boolean = false
  ): Promise<Consumer> {
    // if it's an isolated environment, it's normal to have already the consumer
    if (pathHasConsumer(consumerPath) && !isolated) return Promise.reject(new ConsumerAlreadyExists());
    const bitJson = await ConsumerBitJson.ensure(consumerPath);
    return new Consumer({
      projectPath: consumerPath,
      created: true,
      scope,
      isolated,
      bitJson
    });
  }

  static locateProjectScope(projectPath: string) {
    if (fs.existsSync(path.join(projectPath, DOT_GIT_DIR, BIT_GIT_DIR))) {
      return path.join(projectPath, DOT_GIT_DIR, BIT_GIT_DIR);
    }
    if (fs.existsSync(path.join(projectPath, BIT_HIDDEN_DIR))) return path.join(projectPath, BIT_HIDDEN_DIR);
  }
  static async load(currentPath: PathOsBasedAbsolute): Promise<Consumer> {
    const projectPath = locateConsumer(currentPath);
    if (!projectPath) {
      return Promise.reject(new ConsumerNotFound());
    }
    if (!pathHasConsumer(projectPath) && pathHasBitMap(projectPath)) {
      const consumer = await Consumer.create(currentPath);
      await Promise.all([consumer.bitJson.write({ bitDir: consumer.projectPath }), consumer.scope.ensureDir()]);
    }
    const scopePath = Consumer.locateProjectScope(projectPath);
    const scopeP = Scope.load(scopePath);
    const bitJsonP = ConsumerBitJson.load(projectPath);
    const [scope, bitJson] = await Promise.all([scopeP, bitJsonP]);
    return new Consumer({
      projectPath,
      bitJson,
      scope
    });
  }

  async deprecateRemote(bitIds: Array<BitId>) {
    const groupedBitsByScope = groupArray(bitIds, 'scope');
    const remotes = await getScopeRemotes(this.scope);
    const context = {};
    enrichContextFromGlobal(context);
    const deprecateP = Object.keys(groupedBitsByScope).map(async (scopeName) => {
      const resolvedRemote = await remotes.resolve(scopeName, this.scope);
      const idsStr = groupedBitsByScope[scopeName].map(id => id.toStringWithoutVersion());
      const deprecateResult = await resolvedRemote.deprecateMany(idsStr, context);
      return deprecateResult;
    });
    const deprecatedComponentsResult = await Promise.all(deprecateP);
    return deprecatedComponentsResult;
  }
  async deprecateLocal(bitIds: Array<BitId>) {
    return this.scope.deprecateMany(bitIds);
  }
  async deprecate(bitIds: BitId[], remote: boolean) {
    return remote ? this.deprecateRemote(bitIds) : this.deprecateLocal(bitIds);
  }

  /**
   * Remove components local and remote
   * splits array of ids into local and remote and removes according to flags
   * @param {string[]} ids - list of remote component ids to delete
   * @param {boolean} force - delete component that are used by other components.
   * @param {boolean} remote - delete component from a remote scope
   * @param {boolean} track - keep tracking local staged components in bitmap.
   * @param {boolean} deleteFiles - delete local added files from fs.
   */
  async remove({
    ids,
    force,
    remote,
    track,
    deleteFiles
  }: {
    ids: BitIds,
    force: boolean,
    remote: boolean,
    track: boolean,
    deleteFiles: boolean
  }): Promise<{ localResult: RemovedLocalObjects, remoteResult: Object[] }> {
    logger.debugAndAddBreadCrumb('consumer.remove', `{ids}. force: ${force.toString()}`, { ids: ids.toString() });
    // added this to remove support for remove only one version from a component
    const bitIdsLatest = BitIds.fromArray(
      ids.map((id) => {
        return id.changeVersion(LATEST_BIT_VERSION);
      })
    );
    const [localIds, remoteIds] = partition(bitIdsLatest, id => id.isLocal());
    if (remote && localIds.length) {
      throw new GeneralError(
        `unable to remove the remote components: ${localIds.join(',')} as they don't contain a scope-name`
      );
    }
    const remoteResult = remote && !R.isEmpty(remoteIds) ? await this.removeRemote(remoteIds, force) : [];
    const localResult = !remote
      ? await this.removeLocal(bitIdsLatest, force, track, deleteFiles)
      : new RemovedLocalObjects();

    return { localResult, remoteResult };
  }

  /**
   * Remove remote component from ssh server
   * this method groups remote components by remote name and deletes remote components together
   * @param {BitIds} bitIds - list of remote component ids to delete
   * @param {boolean} force - delete component that are used by other components.
   */
  async removeRemote(bitIds: BitIds, force: boolean) {
    const groupedBitsByScope = groupArray(bitIds, 'scope');
    const remotes = await getScopeRemotes(this.scope);
    const context = {};
    enrichContextFromGlobal(context);
    const removeP = Object.keys(groupedBitsByScope).map(async (key) => {
      const resolvedRemote = await remotes.resolve(key, this.scope);
      const idsStr = groupedBitsByScope[key].map(id => id.toStringWithoutVersion());
      return resolvedRemote.deleteMany(idsStr, force, context);
    });

    return Promise.all(removeP);
  }
  /**
   * delete files from fs according to imported/created
   * @param {BitIds} bitIds - list of remote component ids to delete
   * @param {boolean} deleteFiles - delete component files for authored
   */
  async removeComponentFromFs(bitIds: BitIds, deleteFiles: boolean) {
    logger.debug(`consumer.removeComponentFromFs, ids: ${bitIds.toString()}`);
    const deletePath = async (pathToDelete) => {
      if (!path.isAbsolute(pathToDelete)) {
        throw new Error(`consumer.removeComponentFromFs, expect pathToDelete to be absolute. Got "${pathToDelete}"`);
      }
      logger.debug(`consumer.removeComponentFromFs deleting the following path: ${pathToDelete}`);
      return fs.remove(pathToDelete);
    };
    return Promise.all(
      bitIds.map(async (id) => {
        const ignoreVersion = id.isLocal() || !id.hasVersion();
        const componentMap = this.bitMap.getComponentIfExist(id, { ignoreVersion });
        if (!componentMap) {
          logger.warn(
            `removeComponentFromFs wasn't able to delete ${id.toString()} because the id is missing from bitmap`
          );
          return null;
        }
        if (componentMap.origin === COMPONENT_ORIGINS.IMPORTED || componentMap.origin === COMPONENT_ORIGINS.NESTED) {
          // $FlowFixMe rootDir is set for non authored
          return deletePath(this.toAbsolutePath(componentMap.rootDir));
        } else if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED && deleteFiles) {
          return Promise.all(componentMap.files.map(file => deletePath(this.toAbsolutePath(file.relativePath))));
        }
        return null;
      })
    );
  }

  /**
   * cleanBitMapAndBitJson - clean up removed components from bitmap and bit.json file
   * @param {BitIds} componentsToRemoveFromFs - delete component that are used by other components.
   * @param {BitIds} removedDependencies - delete component that are used by other components.
   */
  async cleanBitMapAndBitJson(componentsToRemoveFromFs: BitIds, removedDependencies: BitIds) {
    logger.debug(
      `consumer.cleanBitMapAndBitJson, cleaning ${componentsToRemoveFromFs.toString()} from .bitmap and bit.json`
    );
    const bitJson = this.bitJson;
    this.bitMap.removeComponents(componentsToRemoveFromFs);
    this.bitMap.removeComponents(removedDependencies);
    componentsToRemoveFromFs.map(x => delete bitJson.dependencies[x.toStringWithoutVersion()]);
    await bitJson.write({ bitDir: this.projectPath });
  }
  /**
   * removeLocal - remove local (imported, new staged components) from modules and bitmap according to flags
   * @param {BitIds} bitIds - list of component ids to delete
   * @param {boolean} force - delete component that are used by other components.
   * @param {boolean} deleteFiles - delete component that are used by other components.
   */
  async removeLocal(
    bitIds: BitIds,
    force: boolean,
    track: boolean,
    deleteFiles: boolean
  ): Promise<RemovedLocalObjects> {
    // local remove in case user wants to delete tagged components
    const modifiedComponents = new BitIds();
    const nonModifiedComponents = new BitIds();
    if (R.isEmpty(bitIds)) return new RemovedLocalObjects();
    if (!force) {
      await Promise.all(
        bitIds.map(async (id) => {
          try {
            const componentStatus = await this.getComponentStatusById(id);
            if (componentStatus.modified) modifiedComponents.push(id);
            else nonModifiedComponents.push(id);
          } catch (err) {
            // if a component has an error, such as, missing main file, we do want to allow removing that component
            if (Component.isComponentInvalidByErrorType(err)) {
              nonModifiedComponents.push(id);
            } else {
              throw err;
            }
          }
        })
      );
    }
    const { removedComponentIds, missingComponents, dependentBits, removedDependencies } = await this.scope.removeMany(
      force ? bitIds : nonModifiedComponents,
      force,
      true,
      this
    );

    if (!R.isEmpty(removedComponentIds)) {
      await this.removeComponentFromFs(removedComponentIds, deleteFiles);
      await this.removeComponentFromFs(removedDependencies, false);
      if (!track) {
        await packageJson.removeComponentsFromWorkspacesAndDependencies(this, removedComponentIds);
        await this.cleanBitMapAndBitJson(removedComponentIds, removedDependencies);
      }
    }
    return new RemovedLocalObjects(
      removedComponentIds,
      missingComponents,
      modifiedComponents,
      removedDependencies,
      dependentBits
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
    let modelCompilerDependencies = new Dependencies([]);
    let modelTesterDependencies = new Dependencies([]);
    if (loadedFromFileSystem) {
      // when loaded from file-system, the dependencies versions are fetched from bit.map.
      // find the model version of the component and get the stored versions of the dependencies
      const mainComponentFromModel: Component = component.componentFromModel;
      if (mainComponentFromModel) {
        // otherwise, the component is probably on the file-system only and not on the model.
        modelDependencies = mainComponentFromModel.dependencies;
        modelDevDependencies = mainComponentFromModel.devDependencies;
        modelCompilerDependencies = mainComponentFromModel.compilerDependencies;
        modelTesterDependencies = mainComponentFromModel.testerDependencies;
      }
    }
    await component.dependencies.addRemoteAndLocalVersions(this.scope, modelDependencies);
    await component.devDependencies.addRemoteAndLocalVersions(this.scope, modelDevDependencies);
    await component.compilerDependencies.addRemoteAndLocalVersions(this.scope, modelCompilerDependencies);
    await component.testerDependencies.addRemoteAndLocalVersions(this.scope, modelTesterDependencies);
  }

  async getAuthoredAndImportedDependentsOfComponents(components: Component[]): Promise<Component[]> {
    const authoredAndImportedComponents = this.bitMap.getAllBitIds([
      COMPONENT_ORIGINS.IMPORTED,
      COMPONENT_ORIGINS.AUTHORED
    ]);
    const componentsIds = BitIds.fromArray(components.map(c => c.id));
    return this.findDirectDependentComponents(authoredAndImportedComponents, componentsIds);
  }

  /**
   * find the components in componentsPool which one of their dependencies include in potentialDependencies
   */
  async findDirectDependentComponents(componentsPool: BitIds, potentialDependencies: BitIds): Promise<Component[]> {
    const componentsVersions: ComponentVersion[] = await this.scope.findDirectDependentComponents(
      componentsPool,
      potentialDependencies
    );
    return Promise.all(
      componentsVersions.map(async (componentVersion) => {
        const manipulateDirData = await getManipulateDirForExistingComponents(this, componentVersion);
        return componentVersion.toConsumer(this.scope.objects, manipulateDirData);
      })
    );
  }

  async ejectConf(componentId: BitId, { ejectPath }: { ejectPath: ?string }) {
    const component = await this.loadComponent(componentId);
    return component.writeConfig(this, ejectPath || this.dirStructure.ejectedEnvsDirStructure);
  }

  async injectConf(componentId: BitId, force: boolean) {
    const component = await this.loadComponent(componentId);
    return component.injectConfig(this.getPath(), this.bitMap, force);
  }

  async onDestroy() {
    await this.cleanTmpFolder();
    return this.bitMap.write();
  }
}
