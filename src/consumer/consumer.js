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
import { ConsumerAlreadyExists, ConsumerNotFound, MissingDependencies, NewerVersionFound } from './exceptions';
import { Driver } from '../driver';
import DriverNotFound from '../driver/exceptions/driver-not-found';
import ConsumerBitJson from './bit-json/consumer-bit-json';
import { BitId, BitIds } from '../bit-id';
import Component from './component';
import {
  BITS_DIRNAME,
  BIT_HIDDEN_DIR,
  COMPONENT_ORIGINS,
  BIT_VERSION,
  NODE_PATH_SEPARATOR,
  LATEST_BIT_VERSION,
  BIT_GIT_DIR,
  DOT_GIT_DIR
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
import { getLatestVersionNumber, pathNormalizeToLinux } from '../utils';
import { loadDependenciesForComponent, updateDependenciesVersions } from './component/dependencies-resolver';
import { Version, Component as ModelComponent } from '../scope/models';
import MissingFilesFromComponent from './component/exceptions/missing-files-from-component';
import ComponentNotFoundInPath from './component/exceptions/component-not-found-in-path';
import { installPackages, installNpmPackagesForComponents } from '../npm-client/install-packages';
import GitHooksManager from '../git-hooks/git-hooks-manager';
import { RemovedLocalObjects } from '../scope/removed-components';
import { linkComponents } from '../links';
import * as packageJson from './component/package-json';
import Remotes from '../remotes/remotes';
import { Dependencies } from './component/dependencies';
import ImportComponents from './component/import-components';
import type { ImportOptions, ImportResult } from './component/import-components';
import type { PathOsBased } from '../utils/path';
import { Analytics } from '../analytics/analytics';
import GeneralError from '../error/general-error';
import { moveExistingComponent } from './component-ops/move-components';
import tagModelComponent from '../scope/component-ops/tag-model-component';

type ConsumerProps = {
  projectPath: string,
  bitJson: ConsumerBitJson,
  scope: Scope,
  created?: boolean,
  isolated?: boolean,
  bitMap: BitMap,
  addedGitHooks: ?(string[]),
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
  _componentsCache: Object = {}; // cache loaded components
  _componentsStatusCache: Object = {}; // cache loaded components
  packageManagerArgs: string[] = []; // args entered by the user in the command line after '--'

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
  }

  get testerId(): ?BitId {
    return BitId.parse(this.bitJson.testerId);
  }

  get compilerId(): ?BitId {
    return BitId.parse(this.bitJson.compilerId);
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
        this.bitJson.dependenciesDirectory
      );
    }
    return this._dirStructure;
  }

  /**
   * Check if the driver installed and print message if not
   *
   *
   * @param {any} msg msg to print in case the driver not found (use string-format with the err context)
   * @returns {boolean} true if the driver exists, false otherwise
   * @memberof Consumer
   */
  warnForMissingDriver(msg: string): boolean {
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
    logger.debug('running migration process for consumer');
    Analytics.addBreadCrumb('migrate', 'running migration process for consumer');

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

    const result: ConsumerMigrationResult = await migrate(bitmapVersion, migratonManifest, this.bitMap, verbose);
    result.bitMap.version = BIT_VERSION;
    await result.bitMap.write();

    return {
      run: true,
      success: true
    };
  }

  write(): Promise<Consumer> {
    return this.bitJson
      .write({ bitDir: this.projectPath })
      .then(() => this.scope.ensureDir())
      .then(() => this.bitMap.write())
      .then(() => this);
  }

  getComponentsPath(): PathOsBased {
    return path.join(this.projectPath, BITS_DIRNAME);
  }

  getPath(): PathOsBased {
    return this.projectPath;
  }

  toAbsolutePath(pathStr: string): PathOsBased {
    return path.join(this.projectPath, pathStr);
  }

  getPathRelativeToConsumer(pathToCheck: string): PathOsBased {
    const absolutePath = path.resolve(pathToCheck);
    return path.relative(this.getPath(), absolutePath);
  }

  async loadComponent(id: BitId): Promise<Component> {
    const { components } = await this.loadComponents([id]);
    return components[0];
  }

  async loadComponents(
    ids: BitId[],
    throwOnFailure: boolean = true
  ): Promise<{ components: Component[], deletedComponents: BitId[] }> {
    logger.debug(`loading consumer-components from the file-system, ids: ${ids.join(', ')}`);
    Analytics.addBreadCrumb(
      'load components',
      `loading consumer-components from the file-system, ids: ${Analytics.hashData(ids)}`
    );
    const alreadyLoadedComponents = [];
    const idsToProcess = [];
    const deletedComponents = [];
    ids.forEach((id) => {
      if (this._componentsCache[id.toString()]) {
        logger.debug(`the component ${id.toString()} has been already loaded, use the cached component`);
        Analytics.addBreadCrumb(
          'load components',
          `the component ${Analytics.hashData(id.toString())} has been already loaded, use the cached component`
        );
        alreadyLoadedComponents.push(this._componentsCache[id.toString()]);
      } else {
        idsToProcess.push(id);
      }
    });
    if (!idsToProcess.length) return { components: alreadyLoadedComponents, deletedComponents };

    const driverExists = this.warnForMissingDriver(
      'Warning: Bit is not be able calculate the dependencies tree. Please install bit-{lang} driver and run commit again.'
    );

    const components = idsToProcess.map(async (id: BitId) => {
      const idWithConcreteVersionString: string = getLatestVersionNumber(
        Object.keys(this.bitMap.getAllComponents()),
        id.toString()
      );
      const idWithConcreteVersion = BitId.parse(idWithConcreteVersionString);

      const componentMap = this.bitMap.getComponent(idWithConcreteVersion, true);
      let bitDir = this.getPath();
      if (componentMap.rootDir) {
        bitDir = path.join(bitDir, componentMap.rootDir);
      }
      const componentWithDependenciesFromModel = await this.scope.getFromLocalIfExist(idWithConcreteVersion);
      const componentFromModel = componentWithDependenciesFromModel
        ? componentWithDependenciesFromModel.component
        : undefined;
      let component;
      try {
        component = await Component.loadFromFileSystem({
          bitDir,
          componentMap,
          id: idWithConcreteVersion,
          consumer: this,
          componentFromModel
        });
      } catch (err) {
        if (throwOnFailure) throw err;

        logger.error(`failed loading ${id} from the file-system`);
        Analytics.addBreadCrumb(
          'load components',
          `failed loading ${Analytics.hashData(id.toString())} from the file-system`
        );
        if (err instanceof MissingFilesFromComponent || err instanceof ComponentNotFoundInPath) {
          deletedComponents.push(id);
          return null;
        }
        throw err;
      }

      component.loadedFromFileSystem = true;
      component.originallySharedDir = componentMap.originallySharedDir || null;
      // reload component map as it may be changed after calling Component.loadFromFileSystem()
      component.componentMap = this.bitMap.getComponent(idWithConcreteVersion, true);
      component.componentFromModel = componentFromModel;

      if (!driverExists || componentMap.origin === COMPONENT_ORIGINS.NESTED) {
        // no need to resolve dependencies
        return component;
      }
      // @todo: check if the files were changed, and if so, skip the next line.
      await loadDependenciesForComponent(component, bitDir, this, idWithConcreteVersionString);
      await updateDependenciesVersions(this, component);
      return component;
    });

    const allComponents = [];
    for (const componentP of components) {
      // load the components one after another (not in parallel).
      const component = await componentP; // eslint-disable-line no-await-in-loop
      if (component) {
        this._componentsCache[component.id.toString()] = component;
        logger.debug(`Finished loading the component, ${component.id.toString()}`);
        Analytics.addBreadCrumb(`Finished loading the component, ${Analytics.hashData(component.id.toString())}`);
        allComponents.push(component);
      }
    }
    if (this.bitMap.hasChanged) await this.bitMap.write();

    return { components: allComponents.concat(alreadyLoadedComponents), deletedComponents };
  }

  importComponents(importOptions: ImportOptions): ImportResult {
    const importComponents = new ImportComponents(this, importOptions);
    return importComponents.importComponents();
  }

  importEnvironment(rawId: string, verbose?: boolean, dontPrintEnvMsg: boolean): Promise<ComponentWithDependencies[]> {
    const bitId = BitId.parse(rawId);
    return this.scope.installEnvironment({ ids: [{ componentId: bitId }], verbose, dontPrintEnvMsg });
  }

  removeFromComponents(id: BitId, currentVersionOnly: boolean = false): Promise<any> {
    const componentsDir = this.getComponentsPath();
    const componentDir = path.join(componentsDir, id.box, id.name, id.scope, currentVersionOnly ? id.version : '');

    return new Promise((resolve, reject) => {
      return fs.remove(componentDir, (err) => {
        if (err) return reject(err);
        return resolve();
      });
    });
  }

  /**
   * write the components into '/components' dir (or according to the bit.map) and its dependencies in the
   * '/components/.dependencies' dir. Both directories are configurable in bit.json
   * For example: global/a has a dependency my-scope/global/b@1. The directories will be:
   * project/root/components/global/a/impl.js
   * project/root/components/.dependencies/global/b/my-scope/1/impl.js
   *
   * In case there are some same dependencies shared between the components, it makes sure to
   * write them only once.
   */
  async writeToComponentsDir({
    silentPackageManagerResult,
    componentsWithDependencies,
    writeToPath,
    override = true, // override files
    writePackageJson = true,
    writeBitJson = true,
    writeBitDependencies = false,
    createNpmLinkFiles = false,
    writeDists = true,
    saveDependenciesAsComponents = false,
    installNpmPackages = true,
    installPeerDependencies = false,
    addToRootPackageJson = true,
    verbose = false, // display the npm output
    excludeRegistryPrefix = false
  }: {
    silentPackageManagerResult: boolean,
    componentsWithDependencies: ComponentWithDependencies[],
    writeToPath?: string,
    override?: boolean,
    writePackageJson?: boolean,
    writeBitJson?: boolean,
    writeBitDependencies?: boolean,
    createNpmLinkFiles?: boolean,
    writeDists?: boolean,
    saveDependenciesAsComponents?: boolean, // as opposed to npm packages
    installNpmPackages?: boolean,
    installPeerDependencies?: boolean,
    addToRootPackageJson?: boolean,
    verbose?: boolean,
    excludeRegistryPrefix?: boolean
  }): Promise<Component[]> {
    const dependenciesIdsCache = [];
    const remotes: Remotes = await this.scope.remotes();
    const writeComponentsP = componentsWithDependencies.map((componentWithDeps: ComponentWithDependencies) => {
      const bitDir = writeToPath
        ? path.resolve(writeToPath)
        : this.composeComponentPath(componentWithDeps.component.id);
      // if it doesn't go to the hub, it can't import dependencies as packages
      componentWithDeps.component.dependenciesSavedAsComponents =
        saveDependenciesAsComponents || !remotes.isHub(componentWithDeps.component.scope);
      // AUTHORED and IMPORTED components can't be saved with multiple versions, so we can ignore the version to
      // find the component in bit.map
      const componentMap = this.bitMap.getComponent(componentWithDeps.component.id.toStringWithoutVersion(), false);
      const origin =
        componentMap && componentMap.origin === COMPONENT_ORIGINS.AUTHORED
          ? COMPONENT_ORIGINS.AUTHORED
          : COMPONENT_ORIGINS.IMPORTED;
      if (origin === COMPONENT_ORIGINS.IMPORTED) {
        componentWithDeps.component.stripOriginallySharedDir(this.bitMap);
      }
      // don't write dists files for authored components as the author has its own mechanism to generate them
      // also, don't write dists file for imported component, unless the user used '--dist' flag
      componentWithDeps.component.dists.writeDistsFiles = writeDists && origin === COMPONENT_ORIGINS.IMPORTED;
      return componentWithDeps.component.write({
        bitDir,
        override,
        writeBitJson,
        writePackageJson,
        origin,
        consumer: this,
        writeBitDependencies: writeBitDependencies || !componentWithDeps.component.dependenciesSavedAsComponents, // when dependencies are written as npm packages, they must be written in package.json
        componentMap,
        excludeRegistryPrefix
      });
    });
    const writtenComponents = await Promise.all(writeComponentsP);

    const allDependenciesP = componentsWithDependencies.map((componentWithDeps: ComponentWithDependencies) => {
      const writeDependenciesP = componentWithDeps.allDependencies.map((dep: Component) => {
        const dependencyId = dep.id.toString();
        const depFromBitMap = this.bitMap.getComponent(dependencyId, false);
        if (!componentWithDeps.component.dependenciesSavedAsComponents && !depFromBitMap) {
          // when depFromBitMap is true, it means that this component was imported as a component already before
          // don't change it now from a component to a package. (a user can do it at any time by using export --eject).
          logger.debug(
            `writeToComponentsDir, ignore dependency ${dependencyId}. It'll be installed later using npm-client`
          );
          Analytics.addBreadCrumb(
            'writeToComponentsDir',
            `writeToComponentsDir, ignore dependency ${Analytics.hashData(
              dependencyId
            )}. It'll be installed later using npm-client`
          );
          return Promise.resolve(null);
        }
        if (depFromBitMap && fs.existsSync(depFromBitMap.rootDir)) {
          dep.writtenPath = depFromBitMap.rootDir;
          logger.debug(
            `writeToComponentsDir, ignore dependency ${dependencyId} as it already exists in bit map and file system`
          );
          Analytics.addBreadCrumb(
            'writeToComponentsDir',
            `writeToComponentsDir, ignore dependency ${Analytics.hashData(
              dependencyId
            )} as it already exists in bit map and file system`
          );
          this.bitMap.addDependencyToParent(componentWithDeps.component.id, dependencyId);
          return Promise.resolve(dep);
        }
        if (dependenciesIdsCache[dependencyId]) {
          logger.debug(`writeToComponentsDir, ignore dependency ${dependencyId} as it already exists in cache`);
          Analytics.addBreadCrumb(
            'writeToComponentsDir',
            `writeToComponentsDir, ignore dependency ${Analytics.hashData(dependencyId)} as it already exists in cache`
          );
          dep.writtenPath = dependenciesIdsCache[dependencyId];
          this.bitMap.addDependencyToParent(componentWithDeps.component.id, dependencyId);
          return Promise.resolve(dep);
        }
        const depBitPath = this.composeDependencyPath(dep.id);
        dep.writtenPath = depBitPath;
        dependenciesIdsCache[dependencyId] = depBitPath;
        // When a component is NESTED we do interested in the exact version, because multiple components with the same scope
        // and namespace can co-exist with different versions.
        const componentMap = this.bitMap.getComponent(dep.id.toString(), false);
        return dep.write({
          bitDir: depBitPath,
          override,
          writePackageJson,
          origin: COMPONENT_ORIGINS.NESTED,
          parent: componentWithDeps.component.id,
          consumer: this,
          componentMap,
          excludeRegistryPrefix
        });
      });

      return Promise.all(writeDependenciesP).then(deps => deps.filter(dep => dep));
    });
    const writtenDependenciesIncludesNull = await Promise.all(allDependenciesP);
    const writtenDependencies = writtenDependenciesIncludesNull.filter(dep => dep);
    if (writeToPath) {
      componentsWithDependencies.forEach((componentWithDeps) => {
        const relativeWrittenPath = this.getPathRelativeToConsumer(componentWithDeps.component.writtenPath);
        if (relativeWrittenPath && path.resolve(relativeWrittenPath) !== path.resolve(writeToPath)) {
          const component = componentWithDeps.component;
          moveExistingComponent(this.bitMap, component, relativeWrittenPath, writeToPath);
        }
      });
    }

    // add workspaces if flag is true
    await packageJson.addWorkspacesToPackageJson(
      this,
      this.getPath(),
      this.bitJson.componentsDefaultDirectory,
      this.bitJson.dependenciesDirectory,
      writeToPath
    );

    await this.bitMap.write();
    if (installNpmPackages) {
      await installNpmPackagesForComponents(
        this,
        componentsWithDependencies,
        verbose,
        silentPackageManagerResult,
        installPeerDependencies
      );
    }
    if (addToRootPackageJson) await packageJson.addComponentsToRoot(this, writtenComponents.map(c => c.id));

    return linkComponents(
      componentsWithDependencies,
      writtenComponents,
      writtenDependencies,
      this,
      createNpmLinkFiles,
      writePackageJson
    );
  }

  /**
   * By default, the dists paths are inside the component.
   * If dist attribute is populated in bit.json, the paths are in consumer-root/dist-target.
   */
  shouldDistsBeInsideTheComponent(): boolean {
    return !this.bitJson.distEntry && !this.bitJson.distTarget;
  }

  async candidateComponentsForAutoTagging(modifiedComponents: BitId[]) {
    const candidateComponents = this.bitMap.getAllComponents([COMPONENT_ORIGINS.AUTHORED, COMPONENT_ORIGINS.IMPORTED]);
    if (!candidateComponents) return null;
    const modifiedComponentsWithoutVersions = modifiedComponents.map(modifiedComponent =>
      modifiedComponent.toStringWithoutVersion()
    );
    const candidateComponentsIds = Object.keys(candidateComponents).map(id => BitId.parse(id));
    // if a modified component is in candidates array, remove it from the array as it will be already tagged with the
    // correct version
    return candidateComponentsIds.filter(
      component => !modifiedComponentsWithoutVersions.includes(component.toStringWithoutVersion())
    );
  }

  async listComponentsForAutoTagging(modifiedComponents: BitId[]): Promise<ModelComponent[]> {
    const candidateComponents = await this.candidateComponentsForAutoTagging(modifiedComponents);
    return this.scope.bumpDependenciesVersions(candidateComponents, modifiedComponents, false);
  }

  /**
   * Check whether a model representation and file-system representation of the same component is the same.
   * The way how it is done is by converting the file-system representation of the component into
   * a Version object. Once this is done, we have two Version objects, and we can compare their hashes
   */
  async isComponentModified(componentFromModel: Version, componentFromFileSystem: Component): boolean {
    if (typeof componentFromFileSystem._isModified === 'undefined') {
      const componentMap = this.bitMap.getComponent(componentFromFileSystem.id, true);
      if (componentMap.originallySharedDir) {
        componentFromFileSystem.originallySharedDir = componentMap.originallySharedDir;
      }
      const { version } = await this.scope.sources.consumerComponentToVersion({
        consumerComponent: componentFromFileSystem
      });

      version.log = componentFromModel.log; // ignore the log, it's irrelevant for the comparison

      // sometime dependencies from the FS don't have an exact version.
      const copyDependenciesVersionsFromModelToFS = (dev = false) => {
        const dependenciesFS = dev ? version.devDependencies : version.dependencies;
        const dependenciesModel = dev ? componentFromModel.devDependencies : componentFromModel.dependencies;
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
      copyDependenciesVersionsFromModelToFS();
      copyDependenciesVersionsFromModelToFS(true);

      /*
       sort packageDependencies for comparing
       */
      const sortObject = (obj) => {
        return Object.keys(obj)
          .sort()
          .reduce(function (result, key) {
            result[key] = obj[key];
            return result;
          }, {});
      };

      // sort the files by 'relativePath' because the order can be changed when adding or renaming
      // files in bitmap, which affects later on the model.
      version.files = R.sortBy(R.prop('relativePath'), version.files);
      componentFromModel.files = R.sortBy(R.prop('relativePath'), componentFromModel.files);

      version.packageDependencies = sortObject(version.packageDependencies);
      componentFromModel.packageDependencies = sortObject(componentFromModel.packageDependencies);
      // uncomment to easily understand why two components are considered as modified
      // if (componentFromModel.hash().hash !== version.hash().hash) {
      //   console.log('-------------------componentFromModel------------------------');
      //   console.log(componentFromModel.id());
      //   console.log('------------------------version------------------------------');
      //   console.log(version.id());
      //   console.log('-------------------------END---------------------------------');
      // }
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
      const componentFromModel: ModelComponent = await this.scope.sources.get(id);
      let componentFromFileSystem;
      try {
        componentFromFileSystem = await this.loadComponent(BitId.parse(id.toStringWithoutVersion()));
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
      if (!componentFromModel) {
        status.newlyCreated = true;
        return status;
      }
      if (componentFromFileSystem.componentMap.origin === COMPONENT_ORIGINS.NESTED) {
        status.nested = true;
        return status;
      }
      status.staged = componentFromModel.isLocallyChanged();
      const versionFromFs = componentFromFileSystem.id.version;
      if (!status.staged && !componentFromFileSystem.id.hasVersion()) {
        throw new GeneralError(
          `component ${id} has an invalid state.
           1) it has a model instance so it's not new.
           2) it's not in staged state.
           3) it doesn't have a version in the bitmap file.
           Maybe the component was interrupted during the export and as a result the bitmap file wasn't updated with the new version
           `
        );
      }
      const versionRef = componentFromModel.versions[versionFromFs];
      if (!versionRef) throw new GeneralError(`version ${versionFromFs} was not found in ${id}`);
      const versionFromModel = await this.scope.getObject(versionRef.hash);
      status.modified = await this.isComponentModified(versionFromModel, componentFromFileSystem);
      return status;
    };
    if (!this._componentsStatusCache[id.toString()]) {
      this._componentsStatusCache[id.toString()] = await getStatus();
    }
    return this._componentsStatusCache[id.toString()];
  }

  async tag(
    ids: BitId[],
    message: string,
    exactVersion: ?string,
    releaseType: string,
    force: ?boolean,
    verbose: ?boolean,
    ignoreMissingDependencies: ?boolean,
    ignoreNewestVersion: boolean
  ): Promise<{ taggedComponents: Component[], autoTaggedComponents: ModelComponent[] }> {
    logger.debug(`committing the following components: ${ids.join(', ')}`);
    Analytics.addBreadCrumb('tag', `committing the following components: ${Analytics.hashData(ids)}`);
    const componentsIds = ids.map(componentId => BitId.parse(componentId));
    const { components } = await this.loadComponents(componentsIds);
    // go through the components list to check if there are missing dependencies
    // if there is at least one we won't commit anything
    if (!ignoreMissingDependencies) {
      const componentsWithMissingDeps = components.filter((component) => {
        return Boolean(component.missingDependencies);
      });
      if (!R.isEmpty(componentsWithMissingDeps)) throw new MissingDependencies(componentsWithMissingDeps);
    }
    // check for each one of the components whether it is using an old version
    if (!ignoreNewestVersion) {
      const throwForNewestVersions = components.map(async (component) => {
        if (component.componentFromModel) {
          // otherwise it's a new component, so this check is irrelevant
          const modelComponent = await this.scope.getModelComponentIfExist(component.id);
          if (!modelComponent) throw new GeneralError(`component ${component.id} was not found in the model`);
          const latest = modelComponent.latest();
          if (latest !== component.version) {
            throw new NewerVersionFound(component.id.toStringWithoutVersion(), component.version, latest);
          }
        }
      });
      await Promise.all(throwForNewestVersions);
    }
    const { taggedComponents, autoTaggedComponents } = await tagModelComponent({
      consumerComponents: components,
      scope: this.scope,
      message,
      exactVersion,
      releaseType,
      force,
      consumer: this,
      verbose
    });

    // update bitmap with the new version
    const taggedComponentIds = taggedComponents.map((component) => {
      this.bitMap.updateComponentId(component.id);
      return component.id;
    });
    const autoTaggedComponentIds = autoTaggedComponents.map((component) => {
      const id = component.toBitId();
      id.version = component.latest();
      this.bitMap.updateComponentId(id);
      return id;
    });

    // update package.json with the new version
    const allComponentIds = taggedComponentIds.concat(autoTaggedComponentIds);
    const updatePackageJsonP = allComponentIds.map((componentId: BitId) => {
      const componentMap = this.bitMap.getComponent(componentId, true);
      if (componentMap.rootDir) {
        return packageJson.updateAttribute(this, componentMap.rootDir, 'version', componentId.version);
      }
      return null;
    });

    await Promise.all([this.bitMap.write(), Promise.all(updatePackageJsonP)]);
    return { taggedComponents, autoTaggedComponents };
  }

  static getNodeModulesPathOfComponent(bindingPrefix: string, id: BitId): PathOsBased {
    if (!id.scope) {
      throw new GeneralError(`Failed creating a path in node_modules for ${id}, as it does not have a scope yet`);
    }
    // Temp fix to support old components before the migration has been running
    bindingPrefix = bindingPrefix === 'bit' ? '@bit' : bindingPrefix;
    return path.join('node_modules', bindingPrefix, [id.scope, id.box, id.name].join(NODE_PATH_SEPARATOR));
  }

  static getComponentIdFromNodeModulesPath(requirePath: string, bindingPrefix: string): string {
    requirePath = pathNormalizeToLinux(requirePath);
    // Temp fix to support old components before the migration has been running
    bindingPrefix = bindingPrefix === 'bit' ? '@bit' : bindingPrefix;
    const prefix = requirePath.includes('node_modules') ? `node_modules/${bindingPrefix}/` : `${bindingPrefix}/`;
    const withoutPrefix = requirePath.substr(requirePath.indexOf(prefix) + prefix.length);
    const componentName = withoutPrefix.includes('/')
      ? withoutPrefix.substr(0, withoutPrefix.indexOf('/'))
      : withoutPrefix;
    const pathSplit = componentName.split(NODE_PATH_SEPARATOR);
    if (pathSplit.length < 3) throw new GeneralError(`component has an invalid require statement: ${requirePath}`);

    const name = pathSplit[pathSplit.length - 1];
    const box = pathSplit[pathSplit.length - 2];
    const scope = pathSplit.length === 3 ? pathSplit[0] : `${pathSplit[0]}.${pathSplit[1]}`;
    return new BitId({ scope, box, name }).toString();
  }

  composeRelativeBitPath(bitId: BitId): string {
    const { componentsDefaultDirectory } = this.dirStructure;
    return format(componentsDefaultDirectory, { name: bitId.name, scope: bitId.scope, namespace: bitId.box });
  }

  composeComponentPath(bitId: BitId): PathOsBased {
    const addToPath = [this.getPath(), this.composeRelativeBitPath(bitId)];
    logger.debug(`component dir path: ${addToPath.join('/')}`);
    Analytics.addBreadCrumb('composeComponentPath', `component dir path: ${Analytics.hashData(addToPath.join('/'))}`);
    return path.join(...addToPath);
  }

  composeDependencyPath(bitId: BitId): PathOsBased {
    const dependenciesDir = this.dirStructure.dependenciesDirStructure;
    return path.join(this.getPath(), dependenciesDir, bitId.toFullPath());
  }

  static create(projectPath: string = process.cwd(), noGit: boolean = false): Promise<Consumer> {
    return this.ensure(projectPath, noGit);
  }

  static ensure(projectPath: PathOsBased = process.cwd(), noGit: boolean = false): Promise<Consumer> {
    const gitDirPath = path.join(projectPath, DOT_GIT_DIR);
    let resolvedScopePath = path.join(projectPath, BIT_HIDDEN_DIR);
    // let addedGitHooks;
    let existingGitHooks;
    if (!noGit && fs.existsSync(gitDirPath) && !fs.existsSync(resolvedScopePath)) {
      resolvedScopePath = path.join(gitDirPath, BIT_GIT_DIR);
      // const gitHooksManager = GitHooksManager.init(gitDirPath);
      // const writeHooksResult = gitHooksManager.writeAllHooks();
      // addedGitHooks = writeHooksResult.added;
      // existingGitHooks = writeHooksResult.alreadyExist;
    }
    const scopeP = Scope.ensure(resolvedScopePath);
    const bitJsonP = ConsumerBitJson.ensure(projectPath);
    const bitMapP = BitMap.ensure(projectPath);

    return Promise.all([scopeP, bitJsonP, bitMapP]).then(([scope, bitJson, bitMap]) => {
      return new Consumer({
        projectPath,
        created: true,
        scope,
        bitJson,
        bitMap,
        // addedGitHooks,
        existingGitHooks
      });
    });
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

  static locateProjectScope(projectPath) {
    if (fs.existsSync(path.join(projectPath, DOT_GIT_DIR, BIT_GIT_DIR))) {
      return path.join(projectPath, DOT_GIT_DIR, BIT_GIT_DIR);
    }
    if (fs.existsSync(path.join(projectPath, BIT_HIDDEN_DIR))) return path.join(projectPath, BIT_HIDDEN_DIR);
  }
  static async load(currentPath: string, throws: boolean = true): Promise<?Consumer> {
    const projectPath = locateConsumer(currentPath);
    if (!projectPath) {
      if (throws) return Promise.reject(new ConsumerNotFound());
      return Promise.resolve(null);
    }
    if (!pathHasConsumer(projectPath) && pathHasBitMap(projectPath)) {
      await Consumer.create(currentPath).then(consumer => consumer.write());
    }
    const scopePath = Consumer.locateProjectScope(projectPath);
    const scopeP = Scope.load(scopePath);
    const bitJsonP = ConsumerBitJson.load(projectPath);
    return Promise.all([scopeP, bitJsonP]).then(
      ([scope, bitJson]) =>
        new Consumer({
          projectPath,
          bitJson,
          scope
        })
    );
  }
  async deprecateRemote(bitIds: Array<BitId>) {
    const groupedBitsByScope = groupArray(bitIds, 'scope');
    const remotes = await this.scope.remotes();
    const context = {};
    enrichContextFromGlobal(context);
    const deprecateP = Object.keys(groupedBitsByScope).map(async (scopeName) => {
      const resolvedRemote = await remotes.resolve(scopeName, this.scope);
      const deprecateResult = await resolvedRemote.deprecateMany(groupedBitsByScope[scopeName], context);
      return deprecateResult;
    });
    const deprecatedComponentsResult = await Promise.all(deprecateP);
    return deprecatedComponentsResult;
  }
  async deprecateLocal(bitIds: Array<BitId>) {
    return this.scope.deprecateMany(bitIds);
  }
  async deprecate(ids: string[], remote: boolean) {
    const bitIds = ids.map(bitId => BitId.parse(bitId));
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
    ids: string[],
    force: boolean,
    remote: boolean,
    track: boolean,
    deleteFiles: boolean
  }) {
    logger.debug(`consumer.remove: ${ids.join(', ')}. force: ${force.toString()}`);
    Analytics.addBreadCrumb(
      'remove',
      `consumer.remove: ${Analytics.hashData(ids)}. force: ${Analytics.hashData(force.toString())}`
    );
    // added this to remove support for remove version
    const bitIds = ids.map(bitId => BitId.parse(bitId)).map((id) => {
      id.version = LATEST_BIT_VERSION;
      return id;
    });
    const [localIds, remoteIds] = partition(bitIds, id => id.isLocal());
    if (remote && localIds.length) {
      throw new GeneralError(
        `unable to remove the remote components: ${localIds.join(',')} as they don't contain a scope-name`
      );
    }
    const remoteResult = remote && !R.isEmpty(remoteIds) ? await this.removeRemote(remoteIds, force) : [];
    const localResult = !remote ? await this.removeLocal(bitIds, force, track, deleteFiles) : new RemovedLocalObjects();

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
    const remotes = await this.scope.remotes();
    const context = {};
    enrichContextFromGlobal(context);
    const removeP = Object.keys(groupedBitsByScope).map(async (key) => {
      const resolvedRemote = await remotes.resolve(key, this.scope);
      return resolvedRemote.deleteMany(groupedBitsByScope[key], force, context);
    });

    return Promise.all(removeP);
  }
  /**
   * delete files from fs according to imported/created
   * @param {BitIds} bitIds - list of remote component ids to delete
   * @param {boolean} deleteFiles - delete component that are used by other components.
   */
  async removeComponentFromFs(bitIds: BitIds, deleteFiles: boolean) {
    return Promise.all(
      bitIds.map(async (id) => {
        const component = id.isLocal()
          ? this.bitMap.getComponent(this.bitMap.getExistingComponentId(id.toStringWithoutVersion()))
          : this.bitMap.getComponent(id);
        if (!component) return null;
        if (
          (component.origin && component.origin === COMPONENT_ORIGINS.IMPORTED) ||
          component.origin === COMPONENT_ORIGINS.NESTED
        ) {
          return fs.remove(path.join(this.getPath(), component.rootDir));
        } else if (component.origin === COMPONENT_ORIGINS.AUTHORED && deleteFiles) {
          return Promise.all(component.files.map(file => fs.remove(file.relativePath)));
        }
        return null;
      })
    );
  }
  /**
   * resolveLocalComponentIds - method is used for resolving local component ids
   * imported = bit.remote/utils/is-string
   * local = utils/is-string
   * if component is imported then cant remove version only component
   * @param {BitIds} bitIds - list of remote component ids to delete
   */
  resolveLocalComponentIds(bitIds: BitIds) {
    return bitIds.map((id) => {
      const realName = this.bitMap.getExistingComponentId(id.toStringWithoutVersion());
      if (!realName) return id;
      const component = this.bitMap.getComponent(realName);
      if (
        component &&
        (component.origin === COMPONENT_ORIGINS.IMPORTED || component.origin === COMPONENT_ORIGINS.NESTED)
      ) {
        const realId = BitId.parse(realName);
        realId.version = LATEST_BIT_VERSION;
        return realId;
      }
      if (component) return BitId.parse(realName);
      return id;
    });
  }

  /**
   * cleanBitMapAndBitJson - clean up removed components from bitmap and bit.json file
   * @param {BitIds} componentsToRemoveFromFs - delete component that are used by other components.
   * @param {BitIds} removedDependencies - delete component that are used by other components.
   */
  async cleanBitMapAndBitJson(componentsToRemoveFromFs: BitIds, removedDependencies: BitIds) {
    const bitJson = this.bitJson;
    this.bitMap.removeComponents(componentsToRemoveFromFs);
    this.bitMap.removeComponents(removedDependencies);
    componentsToRemoveFromFs.map(x => delete bitJson.dependencies[x.toStringWithoutVersion()]);
    bitJson.write({ bitDir: this.projectPath });
    return this.bitMap.write();
  }
  /**
   * removeLocal - remove local (imported, new staged components) from modules and bitmap according to flags
   * @param {BitIds} bitIds - list of remote component ids to delete
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
    const modifiedComponents = [];
    const regularComponents = [];
    const resolvedIDs = this.resolveLocalComponentIds(bitIds);
    if (R.isEmpty(resolvedIDs)) return new RemovedLocalObjects();
    if (!force) {
      await Promise.all(
        resolvedIDs.map(async (id) => {
          const componentStatus = await this.getComponentStatusById(id);
          if (componentStatus.modified) modifiedComponents.push(id);
          else regularComponents.push(id);
        })
      );
    }
    const { removedComponentIds, missingComponents, dependentBits, removedDependencies } = await this.scope.removeMany(
      force ? resolvedIDs : regularComponents,
      force,
      true,
      this
    );

    const componentsToRemoveFromFs = removedComponentIds.filter(id => id.version === LATEST_BIT_VERSION);
    if (!R.isEmpty(removedComponentIds)) {
      await this.removeComponentFromFs(componentsToRemoveFromFs, deleteFiles);
      await this.removeComponentFromFs(removedDependencies, false);
    }
    if ((!track || deleteFiles) && !R.isEmpty(removedComponentIds)) {
      await packageJson.removeComponentsFromWorkspacesAndDependencies(
        this,
        this.getPath(),
        this.bitMap,
        componentsToRemoveFromFs
      );
      await this.cleanBitMapAndBitJson(componentsToRemoveFromFs, removedDependencies);
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
    if (loadedFromFileSystem) {
      // when loaded from file-system, the dependencies versions are fetched from bit.map.
      // try to find the model version of the component to get the stored versions of the dependencies
      try {
        const mainComponentFromModel: Component = await this.scope.loadRemoteComponent(component.id);
        modelDependencies = mainComponentFromModel.dependencies;
        modelDevDependencies = mainComponentFromModel.devDependencies;
      } catch (e) {
        // do nothing. the component is probably on the file-system only and not on the model.
      }
    }
    await component.dependencies.addRemoteAndLocalVersions(this.scope, modelDependencies);
    await component.devDependencies.addRemoteAndLocalVersions(this.scope, modelDevDependencies);
  }

  async eject(componentsIds: BitId[]) {
    const componentIdsWithoutScope = componentsIds.map(id => id.toStringWithoutScope());
    await this.remove({ ids: componentIdsWithoutScope, force: true, remote: false, track: false, deleteFiles: true });
    await packageJson.addComponentsWithVersionToRoot(this, componentsIds);
    await packageJson.removeComponentsFromNodeModules(this, componentsIds);
    await installPackages(this, [], true, true);

    return componentsIds;
  }
}
