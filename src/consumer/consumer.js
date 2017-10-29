/** @flow */
import path from 'path';
import groupArray from 'group-array';
import fs from 'fs-extra';
import R from 'ramda';
import chalk from 'chalk';
import format from 'string-format';
import symlinkOrCopy from 'symlink-or-copy';
import { locateConsumer, pathHasConsumer } from './consumer-locator';
import { ConsumerAlreadyExists, ConsumerNotFound, NothingToImport, MissingDependencies } from './exceptions';
import { Driver } from '../driver';
import DriverNotFound from '../driver/exceptions/driver-not-found';
import ConsumerBitJson from './bit-json/consumer-bit-json';
import { BitId, BitIds } from '../bit-id';
import Component from './component';
import {
  BITS_DIRNAME,
  BIT_HIDDEN_DIR,
  DEPENDENCIES_DIR,
  COMPONENT_ORIGINS,
  DEFAULT_BINDINGS_PREFIX
} from '../constants';
import { Scope, ComponentWithDependencies } from '../scope';
import loader from '../cli/loader';
import { BEFORE_IMPORT_ACTION } from '../cli/loader/loader-messages';
import BitMap from './bit-map/bit-map';
import ComponentMap from './bit-map/component-map';
import type { BitMapComponents } from './bit-map/bit-map';
import logger from '../logger/logger';
import DirStructure from './dir-structure/dir-structure';
import { getLatestVersionNumber, pathRelative } from '../utils';
import * as linkGenerator from './component/link-generator';
import loadDependenciesForComponent from './component/dependencies-resolver';
import Version from '../scope/models/version';

export type ConsumerProps = {
  projectPath: string,
  created?: boolean,
  bitJson: ConsumerBitJson,
  scope: Scope
};

export default class Consumer {
  projectPath: string;
  created: boolean;
  bitJson: ConsumerBitJson;
  scope: Scope;
  _driver: Driver;
  _bitMap: BitMap;
  _dirStructure: DirStructure;
  _componentsCache: Object; // cache loaded components

  constructor({ projectPath, bitJson, scope, created = false }: ConsumerProps) {
    this.projectPath = projectPath;
    this.bitJson = bitJson;
    this.created = created;
    this.scope = scope;
    this.warnForMissingDriver();
    this._componentsCache = {};
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
      this._dirStructure = new DirStructure(this.bitJson.structure);
    }
    return this._dirStructure;
  }

  async getBitMap(): Promise<BitMap> {
    if (!this._bitMap) {
      this._bitMap = await BitMap.load(this.getPath());
    }
    return this._bitMap;
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
        : `Warning: Bit is not be able to run the bind command. Please install bit-${err.lang} driver and run the bind command.`;
      if (err instanceof DriverNotFound) {
        console.log(chalk.yellow(msg)); // eslint-disable-line
      }
      return false;
    }
  }

  write(): Promise<Consumer> {
    return this.bitJson
      .write({ bitDir: this.projectPath })
      .then(() => this.scope.ensureDir())
      .then(() => this);
  }

  getComponentsPath(): string {
    return path.join(this.projectPath, BITS_DIRNAME);
  }

  getPath(): string {
    return this.projectPath;
  }

  getPathRelativeToConsumer(pathToCheck: string): string {
    const absolutePath = path.resolve(pathToCheck);
    return path.relative(this.getPath(), absolutePath);
  }

  async loadComponent(id: BitId): Promise<Component> {
    const components = await this.loadComponents([id]);
    return components[0];
  }

  async loadComponents(ids: BitId[]): Promise<Component[]> {
    logger.debug(`loading consumer-components from the file-system, ids: ${ids.join(', ')}`);
    const alreadyLoadedComponents = [];
    const idsToProcess = [];
    ids.forEach((id) => {
      if (this._componentsCache[id.toString()]) {
        logger.debug(`the component ${id.toString()} has been already loaded, use the cached component`);
        alreadyLoadedComponents.push(this._componentsCache[id.toString()]);
      } else {
        idsToProcess.push(id);
      }
    });
    if (!idsToProcess.length) return alreadyLoadedComponents;

    const bitMap: BitMap = await this.getBitMap();

    const driverExists = this.warnForMissingDriver(
      'Warning: Bit is not be able calculate the dependencies tree. Please install bit-{lang} driver and run commit again.'
    );

    const components = idsToProcess.map(async (id: BitId) => {
      const idWithConcreteVersionString = getLatestVersionNumber(Object.keys(bitMap.getAllComponents()), id.toString());
      const idWithConcreteVersion = BitId.parse(idWithConcreteVersionString);

      const componentMap = bitMap.getComponent(idWithConcreteVersion, true);
      let bitDir = this.getPath();
      if (componentMap.rootDir) {
        bitDir = path.join(bitDir, componentMap.rootDir);
      }
      const componentModule = await this.scope.sources.get(id);
      const component = Component.loadFromFileSystem({
        bitDir,
        consumerBitJson: this.bitJson,
        componentMap,
        id: idWithConcreteVersion,
        consumerPath: this.getPath(),
        bitMap,
        deprecated: componentModule ? componentModule.deprecated : false
      });
      if (bitMap.hasChanged) await bitMap.write();
      if (!driverExists || componentMap.origin === COMPONENT_ORIGINS.NESTED) {
        // no need to resolve dependencies
        return component;
      }
      return loadDependenciesForComponent(
        component,
        componentMap,
        bitDir,
        this.driver,
        bitMap,
        this.getPath(),
        idWithConcreteVersionString
      );
    });

    const allComponents = [];
    for (const componentP of components) {
      // load the components one after another (not in parallel).
      const component = await componentP;
      this._componentsCache[component.id.toString()] = component;
      logger.debug(`Finished loading the component, ${component.id.toString()}`);
      allComponents.push(component);
    }

    return allComponents.concat(alreadyLoadedComponents);
  }

  async importAccordingToBitJsonAndBitMap(
    verbose?: boolean,
    withEnvironments: ?boolean,
    cache?: boolean = true,
    withPackageJson?: boolean = true
  ): Promise<> {
    const dependenciesFromBitJson = BitIds.fromObject(this.bitJson.dependencies);
    const bitMap = await this.getBitMap();
    const componentsFromBitMap = bitMap.getAuthoredExportedComponents();

    if ((R.isNil(dependenciesFromBitJson) || R.isEmpty(dependenciesFromBitJson)) && R.isEmpty(componentsFromBitMap)) {
      if (!withEnvironments) {
        return Promise.reject(new NothingToImport());
      } else if (R.isNil(this.testerId) && R.isNil(this.compilerId)) {
        return Promise.reject(new NothingToImport());
      }
    }
    let componentsAndDependenciesBitJson = [];
    let componentsAndDependenciesBitMap = [];
    if (dependenciesFromBitJson) {
      componentsAndDependenciesBitJson = await this.scope.getManyWithAllVersions(dependenciesFromBitJson, cache);
      await this.writeToComponentsDir(componentsAndDependenciesBitJson, undefined, undefined, withPackageJson);
    }
    if (componentsFromBitMap.length) {
      componentsAndDependenciesBitMap = await this.scope.getManyWithAllVersions(componentsFromBitMap, cache);
      // Don't write the package.json for an authored component, because it's dependencies probably managed
      // By the root packge.json
      await this.writeToComponentsDir(componentsAndDependenciesBitMap, undefined, false, false);
    }
    const componentsAndDependencies = [...componentsAndDependenciesBitJson, ...componentsAndDependenciesBitMap];
    if (withEnvironments) {
      const envComponents = await this.scope.installEnvironment({
        ids: [this.testerId, this.compilerId],
        verbose
      });
      return {
        dependencies: componentsAndDependencies,
        envDependencies: envComponents
      };
    }
    return { dependencies: componentsAndDependencies };
  }

  async importSpecificComponents(
    rawIds: ?(string[]),
    cache?: boolean,
    writeToPath?: string,
    withPackageJson?: boolean = true
  ) {
    logger.debug(`importSpecificComponents, Ids: ${rawIds.join(', ')}`);
    // $FlowFixMe - we check if there are bitIds before we call this function
    const bitIds = rawIds.map(raw => BitId.parse(raw));
    const componentDependenciesArr = await this.scope.getManyWithAllVersions(bitIds, cache);
    await this.writeToComponentsDir(componentDependenciesArr, writeToPath, undefined, withPackageJson);
    return { dependencies: componentDependenciesArr };
  }

  import(
    rawIds: ?(string[]),
    verbose?: boolean,
    withEnvironments: ?boolean,
    cache?: boolean = true,
    writeToPath?: string,
    withPackageJson?: boolean = true
  ): Promise<{ dependencies: ComponentWithDependencies[], envDependencies?: Component[] }> {
    loader.start(BEFORE_IMPORT_ACTION);
    if (!rawIds || R.isEmpty(rawIds)) {
      return this.importAccordingToBitJsonAndBitMap(verbose, withEnvironments, cache, withPackageJson);
    }
    return this.importSpecificComponents(rawIds, cache, writeToPath, withPackageJson);
  }

  importEnvironment(rawId: ?string, verbose?: boolean) {
    if (!rawId) {
      throw new Error('you must specify bit id for importing');
    } // @TODO - make a normal error message
    const bitId = BitId.parse(rawId);
    return this.scope.installEnvironment({ ids: [bitId], verbose }).then((envDependencies) => {
      // todo: do we need the environment in bit.map?
      // this.bitMap.addComponent(bitId.toString(), this.composeRelativeBitPath(bitId));
      // this.bitMap.write();
      return envDependencies;
    });
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
  async writeToComponentsDir(
    componentDependencies: ComponentWithDependencies[],
    writeToPath?: string,
    force?: boolean = true,
    withPackageJson?: boolean = true
  ): Promise<Component[]> {
    const bitMap: BitMap = await this.getBitMap();
    const dependenciesIdsCache = [];
    const writeComponentsP = componentDependencies.map((componentWithDeps) => {
      const bitDir = writeToPath || this.composeComponentPath(componentWithDeps.component.id);
      componentWithDeps.component.writtenPath = bitDir;
      return componentWithDeps.component.write({
        bitDir,
        force,
        bitMap,
        withPackageJson,
        origin: COMPONENT_ORIGINS.IMPORTED,
        consumerPath: this.getPath(),
        driver: this.driver
      });
    });
    const writtenComponents = await Promise.all(writeComponentsP);

    const allDependenciesP = componentDependencies.map((componentWithDeps) => {
      const writeDependenciesP = componentWithDeps.dependencies.map((dep: Component) => {
        const dependencyId = dep.id.toString();
        const depFromBitMap = bitMap.getComponent(dependencyId, false);
        if (depFromBitMap) {
          dep.writtenPath = depFromBitMap.rootDir;
          logger.debug(`writeToComponentsDir, ignore dependency ${dependencyId} as it already exists in bit map`);
          bitMap.addDependencyToParent(componentWithDeps.component.id, dependencyId);
          return Promise.resolve(dep);
        }

        if (dependenciesIdsCache[dependencyId]) {
          logger.debug(`writeToComponentsDir, ignore dependency ${dependencyId} as it already exists in cache`);
          dep.writtenPath = dependenciesIdsCache[dependencyId];
          bitMap.addDependencyToParent(componentWithDeps.component.id, dependencyId);
          return Promise.resolve(dep);
        }

        const depBitPath = this.composeDependencyPath(dep.id);
        dep.writtenPath = depBitPath;
        dependenciesIdsCache[dependencyId] = depBitPath;
        return dep
          .write({
            bitDir: depBitPath,
            force,
            bitMap,
            withPackageJson,
            origin: COMPONENT_ORIGINS.NESTED,
            parent: componentWithDeps.component.id,
            consumerPath: this.getPath(),
            driver: this.driver
          })
          .then(() => linkGenerator.writeEntryPointsForImportedComponent(dep, bitMap))
          .then(() => dep);
      });

      return Promise.all(writeDependenciesP);
    });
    const writtenDependencies = await Promise.all(allDependenciesP);

    if (writeToPath) {
      componentDependencies.forEach((componentWithDeps) => {
        const relativeWrittenPath = this.getPathRelativeToConsumer(componentWithDeps.component.writtenPath);
        if (relativeWrittenPath !== writeToPath) {
          const component = componentWithDeps.component;
          this.moveExistingComponent(bitMap, component, relativeWrittenPath, writeToPath);
        }
      });
    }

    await linkGenerator.writeDependencyLinks(componentDependencies, bitMap, this.getPath());
    await Promise.all(
      componentDependencies.map(componentWithDependencies =>
        linkGenerator.writeEntryPointsForImportedComponent(componentWithDependencies.component, bitMap)
      )
    );
    await bitMap.write();
    const allComponents = [...writtenComponents, ...R.flatten(writtenDependencies)];
    this.bindComponents(allComponents, bitMap);
    return allComponents;
  }

  moveExistingComponent(bitMap: BitMap, component: Component, oldPath: string, newPath: string) {
    if (fs.existsSync(newPath)) {
      throw new Error(
        `could not move the component ${component.id} from ${oldPath} to ${newPath} as the destination path already exists`
      );
    }
    const componentMap = bitMap.getComponent(component.id);
    componentMap.updateDirLocation(oldPath, newPath);
    fs.moveSync(oldPath, newPath);
    component.writtenPath = newPath;
  }

  async bumpDependenciesVersions(committedComponents: Component[]) {
    const bitMap = await this.getBitMap();
    const authoredComponents = bitMap.getAllComponents(COMPONENT_ORIGINS.AUTHORED);
    if (!authoredComponents) return null;
    const committedComponentsWithoutVersions = committedComponents.map(committedComponent =>
      committedComponent.id.toStringWithoutVersion()
    );
    const authoredComponentsIds = Object.keys(authoredComponents).map(id => BitId.parse(id));
    // if a committed component is in authored array, remove it from the array as it has already been committed with the correct version
    const componentsToUpdate = authoredComponentsIds.filter(
      component => !committedComponentsWithoutVersions.includes(component.toStringWithoutVersion())
    );
    return this.scope.bumpDependenciesVersions(componentsToUpdate, committedComponents);
  }

  /**
   * Check whether a model representation and file-system representation of the same component is the same.
   * The way how it is done is by converting the file-system representation of the component into
   * a Version object. Once this is done, we have two Version objects, and we can compare their hashes
   */
  async isComponentModified(componentFromModel: Version, componentFromFileSystem: Component): boolean {
    const { version } = await this.scope.sources.consumerComponentToVersion({
      consumerComponent: componentFromFileSystem,
      consumer: this,
      forHashOnly: true
    });

    version.log = componentFromModel.log; // ignore the log, it's irrelevant for the comparison
    version.flattenedDependencies = componentFromModel.flattenedDependencies;
    // dependencies from the FS don't have an exact version, copy the version from the model
    version.dependencies.forEach((dependency) => {
      const idWithoutVersion = dependency.id.toStringWithoutVersion();
      const dependencyFromModel = componentFromModel.dependencies.find(
        modelDependency => modelDependency.id.toStringWithoutVersion() === idWithoutVersion
      );
      if (dependencyFromModel) {
        dependency.id = dependencyFromModel.id;
      }
    });

    // uncomment to easily understand why two components are considered as modified
    // if (componentFromModel.hash().hash !== version.hash().hash) {
    //   console.log('-------------------componentFromModel------------------------');
    //   console.log(componentFromModel.id());
    //   console.log('------------------------version------------------------------');
    //   console.log(version.id());
    //   console.log('-------------------------END---------------------------------');
    // }
    return componentFromModel.hash().hash !== version.hash().hash;
  }

  /**
   * @see isComponentModified for the implementation of the comparison
   */
  async isComponentModifiedById(id: string): Promise<boolean> {
    const idParsed = BitId.parse(id);
    const componentFromModel = await this.scope.sources.get(idParsed);
    if (!componentFromModel) return true; // the component was never committed
    const latestVersionRef = componentFromModel.versions[componentFromModel.latest()];
    const versionFromModel = await this.scope.getObject(latestVersionRef.hash);
    const componentFromFileSystem = await this.loadComponent(idParsed);
    return this.isComponentModified(versionFromModel, componentFromFileSystem);
  }

  async commit(
    ids: BitId[],
    message: string,
    force: ?boolean,
    verbose: ?boolean,
    ignoreMissingDependencies: ?boolean
  ): Promise<Component[]> {
    logger.debug(`committing the following components: ${ids.join(', ')}`);
    const componentsIds = ids.map(componentId => BitId.parse(componentId));
    const components = await this.loadComponents(componentsIds);
    // Run over the components to check if there is missing dependencies
    // If there is at least one we won't commit anything
    if (!ignoreMissingDependencies) {
      const componentsWithMissingDeps = components.filter((component) => {
        return Boolean(component.missingDependencies);
      });
      if (!R.isEmpty(componentsWithMissingDeps)) throw new MissingDependencies(componentsWithMissingDeps);
    }
    const committedComponents = await this.scope.putMany({
      consumerComponents: components,
      message,
      force,
      consumer: this,
      verbose
    });
    await this.bumpDependenciesVersions(committedComponents);

    return components;
  }

  bindComponents(components: Component[], bitMap: BitMap): Object[] {
    const writeDependencyLink = (parentRootDir: string, bitId: BitId, rootDir: string, bindingPrefix: string) => {
      const srcPath = path.join(this.getPath(), rootDir);
      const relativeDestPath = path.join('node_modules', bindingPrefix, bitId.box, bitId.name);
      const destPath = path.join(this.getPath(), parentRootDir, relativeDestPath);
      fs.removeSync(destPath); // in case a component has been moved
      fs.ensureDirSync(path.dirname(destPath));
      // Create a symlink at destPath pointing to srcPath.
      symlinkOrCopy.sync(srcPath, destPath);
      return { from: parentRootDir, to: rootDir };
    };

    const writeDependenciesLinks = (component, componentMap) => {
      return component.dependencies.map((dependency) => {
        const dependencyComponentMap = bitMap.getComponent(dependency.id);
        return writeDependencyLink(
          componentMap.rootDir,
          dependency.id,
          dependencyComponentMap.rootDir,
          component.bindingPrefix
        );
      });
    };

    const writeMissingLinks = (component, componentMap) => {
      return component.missingDependencies.missingLinks.map((dependencyIdStr) => {
        const dependencyId = bitMap.getExistingComponentId(dependencyIdStr);
        if (!dependencyId) return null;
        const dependencyComponentMap = bitMap.getComponent(dependencyId);
        return writeDependencyLink(
          componentMap.rootDir,
          BitId.parse(dependencyId),
          dependencyComponentMap.rootDir,
          component.bindingPrefix
        );
      });
    };

    return components.map((component) => {
      const componentId = component.id;
      logger.debug(`binding component: ${componentId}`);
      const componentMap: ComponentMap = bitMap.getComponent(componentId, true);
      if (componentMap.origin === COMPONENT_ORIGINS.IMPORTED) {
        const target = path.join(this.getPath(), componentMap.rootDir);
        const relativeLinkPath = path.join(
          'node_modules',
          this.bitJson.bindingPrefix,
          componentId.box,
          componentId.name
        );
        const linkPath = path.join(this.getPath(), relativeLinkPath);
        fs.removeSync(linkPath); // in case a component has been moved
        fs.ensureDirSync(path.dirname(linkPath));
        symlinkOrCopy.sync(target, linkPath);
        const bound = [{ from: componentMap.rootDir, to: relativeLinkPath }];
        const boundDependencies = component.dependencies ? writeDependenciesLinks(component, componentMap) : [];
        const boundMissingDependencies =
          component.missingDependencies && component.missingDependencies.missingLinks
            ? writeMissingLinks(component, componentMap)
            : [];
        return { id: componentId, bound: bound.concat([...boundDependencies, ...boundMissingDependencies]) };
      }
      if (componentMap.origin === COMPONENT_ORIGINS.NESTED) {
        if (!component.dependencies) return { id: componentId, bound: [] };
        const bound = writeDependenciesLinks(component, componentMap);
        return { id: componentId, bound };
      }

      // origin is AUTHORED
      // const filesToBind = componentMap.getFilesRelativeToConsumer(); // todo: check why it throws an error randomly "TypeError: componentMap.getFilesRelativeToConsumer is not a function"
      const filesToBind = componentMap.files.map((file) => {
        return componentMap.rootDir ? path.join(componentMap.rootDir, file.relativePath) : file.relativePath;
      });
      const bound = filesToBind.map((file) => {
        const dest = path.join('node_modules', component.bindingPrefix, componentId.box, componentId.name, file);
        const destRelative = pathRelative(path.dirname(dest), file);
        const fileContent = `module.exports = require('${destRelative}');`;
        fs.outputFileSync(dest, fileContent);
        return { from: dest, to: file };
      });
      return { id: componentId, bound };
    });
  }

  async bindAll() {
    const bitMap = await this.getBitMap();
    const componentsMaps = bitMap.getAllComponents();
    if (R.isEmpty(componentsMaps)) throw new Error('nothing to bind');
    const componentsIds = Object.keys(componentsMaps).map(componentId => BitId.parse(componentId));
    const components = await this.loadComponents(componentsIds);
    fs.removeSync(path.join(this.getPath(), 'node_modules', 'bit')); // todo: move to bit-javascript
    return this.bindComponents(components, bitMap);
  }

  composeRelativeBitPath(bitId: BitId): string {
    const { staticParts, dynamicParts } = this.dirStructure.componentsDirStructure;
    const dynamicDirs = dynamicParts.map(part => bitId[part]);
    const addToPath = [...staticParts, ...dynamicDirs];
    return path.join(...addToPath);
  }

  composeComponentPath(bitId: BitId): string {
    const addToPath = [this.getPath(), this.composeRelativeBitPath(bitId)];
    logger.debug(`component dir path: ${addToPath.join('/')}`);
    return path.join(...addToPath);
  }

  composeDependencyPath(bitId: BitId): string {
    const dependenciesDir = this.dirStructure.dependenciesDirStructure;
    return path.join(this.getPath(), dependenciesDir, bitId.toFullPath());
  }

  async runComponentSpecs(id: BitId, verbose: boolean = false): Promise<?any> {
    const bitMap = await this.getBitMap();
    return this.loadComponent(id).then((component) => {
      return component.runSpecs({ scope: this.scope, consumer: this, bitMap, verbose });
    });
  }

  async movePaths({ from, to }: { from: string, to: string }) {
    const fromExists = fs.existsSync(from);
    const toExists = fs.existsSync(to);
    if (fromExists && toExists) {
      throw new Error(`unable to move because both paths from (${from}) and to (${to}) already exist`);
    }
    if (!fromExists && !toExists) throw new Error(`both paths from (${from}) and to (${to}) do not exist`);

    const fromRelative = this.getPathRelativeToConsumer(from);
    const toRelative = this.getPathRelativeToConsumer(to);
    const bitMap = await this.getBitMap();
    const changes = bitMap.updatePathLocation(fromRelative, toRelative, fromExists);
    if (fromExists && !toExists) {
      // user would like to physically move the file. Otherwise (!fromExists and toExists), user would like to only update bit.map
      fs.moveSync(from, to);
    }
    await bitMap.write();
    return changes;
  }

  static create(projectPath: string = process.cwd()): Promise<Consumer> {
    if (pathHasConsumer(projectPath)) return Promise.reject(new ConsumerAlreadyExists());
    return this.ensure(projectPath);
  }

  static ensure(projectPath: string = process.cwd()): Promise<Consumer> {
    const scopeP = Scope.ensure(path.join(projectPath, BIT_HIDDEN_DIR));
    const bitJsonP = ConsumerBitJson.ensure(projectPath);

    return Promise.all([scopeP, bitJsonP]).then(([scope, bitJson]) => {
      return new Consumer({
        projectPath,
        created: true,
        scope,
        bitJson
      });
    });
  }

  static async createWithExistingScope(consumerPath: string, scope: Scope): Promise<Consumer> {
    if (pathHasConsumer(consumerPath)) return Promise.reject(new ConsumerAlreadyExists());
    const bitJson = await ConsumerBitJson.ensure(consumerPath);
    return new Consumer({
      projectPath: consumerPath,
      created: true,
      scope,
      bitJson
    });
  }

  static async load(currentPath: string): Promise<Consumer> {
    // TODO: Refactor - remove the new Promise((resolve, reject) it's a bad practice use Promise.reject if needed
    const projectPath = locateConsumer(currentPath);
    if (!projectPath) return Promise.reject(new ConsumerNotFound());
    const scopeP = Scope.load(path.join(projectPath, BIT_HIDDEN_DIR));
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
    const deprecateP = Object.keys(groupedBitsByScope).map(async (scopeName) => {
      const resolvedRemote = await remotes.resolve(scopeName, this.scope);
      const deprecateResult = await resolvedRemote.deprecateMany(groupedBitsByScope[scopeName]);
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

  async removeRemote(bitIds: Array<BitId>, force: boolean) {
    const groupedBitsByScope = groupArray(bitIds, 'scope');
    const remotes = await this.scope.remotes();
    const removeP = Object.keys(groupedBitsByScope).map(async (key) => {
      const resolvedRemote = await remotes.resolve(key, this.scope);
      const result = await resolvedRemote.deleteMany(groupedBitsByScope[key], force);
      return result;
    });
    const removeResults = await Promise.all(removeP);
    return removeResults;
  }
  async removeLocal(bitIds: Array<BitId>, force: boolean, track: boolean) {
    // local remove in case user wants to delete commited components
    const removedIds = await this.scope.removeMany(bitIds, force);
    if (!track && removedIds.bitIds) {
      const bitMap = await this.getBitMap();
      removedIds.bitIds.forEach((id) => {
        bitMap.removeComponent(id);
      });
      await bitMap.write();
    }
    return removedIds;
  }
  async remove(ids: string[], remote: boolean, force: boolean, track: boolean) {
    const bitIds = ids.map(bitId => BitId.parse(bitId));
    return remote ? this.removeRemote(bitIds, force) : this.removeLocal(bitIds, force, track);
  }

  async addRemoteAndLocalVersionsToDependencies(component: Component, loadedFromFileSystem: boolean) {
    logger.debug(`addRemoteAndLocalVersionsToDependencies for ${component.id.toString()}`);
    let modelDependencies = [];
    if (loadedFromFileSystem) {
      // when loaded from file-system, the dependencies versions are fetched from bit.map.
      // try to find the model version of the component to get the stored versions of the dependencies
      try {
        const mainComponentFromModel = await this.scope.loadRemoteComponent(component.id);
        modelDependencies = mainComponentFromModel.dependencies;
      } catch (e) {
        // do nothing. the component is probably on the file-system only and not on the model.
      }
    }
    const dependenciesIds = component.dependencies.map(dependency => dependency.id);
    const localDependencies = await this.scope.latestVersions(dependenciesIds);
    const remoteVersionsDependencies = await this.scope.fetchRemoteVersions(dependenciesIds);
    component.dependencies.forEach((dependency) => {
      const dependencyIdWithoutVersion = dependency.id.toStringWithoutVersion();
      const removeVersionId = remoteVersionsDependencies.find(
        remoteId => remoteId.toStringWithoutVersion() === dependencyIdWithoutVersion
      );
      const localVersionId = localDependencies.find(
        localId => localId.toStringWithoutVersion() === dependencyIdWithoutVersion
      );
      const modelVersionId = modelDependencies.find(
        modelDependency => modelDependency.id.toStringWithoutVersion() === dependencyIdWithoutVersion
      );
      dependency.remoteVersion = removeVersionId ? removeVersionId.version : null;
      dependency.localVersion = localVersionId ? localVersionId.version : null;
      dependency.currentVersion = modelVersionId ? modelVersionId.id.version : dependency.id.version;
    });
  }
}
