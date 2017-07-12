/** @flow */
import path from 'path';
import glob from 'glob';
import fs from 'fs-extra';
import R from 'ramda';
import chalk from 'chalk';
import format from 'string-format';
import VersionDependencies from '../scope/version-dependencies';
import { flattenDependencies } from '../scope/flatten-dependencies';
import { locateConsumer, pathHasConsumer } from './consumer-locator';
import {
  ConsumerAlreadyExists,
  ConsumerNotFound,
  NothingToImport,
  MissingDependencies,
  MissingDependenciesOnFs
} from './exceptions';
import { Driver } from '../driver';
import DriverNotFound from '../driver/exceptions/driver-not-found';
import ConsumerBitJson from './bit-json/consumer-bit-json';
import { BitId, BitIds } from '../bit-id';
import Component from './component';
import ComponentsList from './component/components-list';
import {
  INLINE_BITS_DIRNAME,
  BITS_DIRNAME,
  BIT_HIDDEN_DIR,
  DEPENDENCIES_DIR,
  COMPONENT_ORIGINS,
 } from '../constants';
import { Scope, ComponentDependencies } from '../scope';
import BitInlineId from './bit-inline-id';
import loader from '../cli/loader';
import { BEFORE_IMPORT_ACTION } from '../cli/loader/loader-messages';
import BitMap from './bit-map/bit-map';
import logger from '../logger/logger';
import DirStructure from './dir-structure/dir-structure';

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

  constructor({ projectPath, bitJson, scope, created = false }: ConsumerProps) {
    this.projectPath = projectPath;
    this.bitJson = bitJson;
    this.created = created;
    this.scope = scope;
    this.warnForMissingDriver();
  }

  get testerId(): ?BitId {
    return BitId.parse(this.bitJson.testerId, this.scope);
  }

  get compilerId(): ?BitId {
    return BitId.parse(this.bitJson.compilerId, this.scope);
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

  async getBitMap(): BitMap {
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
  warnForMissingDriver(msg) : boolean {
    try {
      this.driver.getDriver(false);
      return true;
    } catch (err) {
      msg = msg ? format(msg, err) : `Warning: Bit is not be able to run the bind command. Please install bit-${err.lang} driver and run the bind command.`;
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

  getInlineBitsPath(): string {
    return path.join(this.projectPath, INLINE_BITS_DIRNAME);
  }

  getComponentsPath(): string {
    return path.join(this.projectPath, BITS_DIRNAME);
  }

  getPath(): string {
    return this.projectPath;
  }

  getBitPathInComponentsDir(id: BitId): string {
    return path.join(this.getComponentsPath(), id.toPath());
  }

  async loadComponent(id: BitId): Promise<Component> {
    logger.debug(`loading a consumer-component ${id} from the file-system`);
    const components = await this.loadComponents([id]);
    return components[0];
  }

  async loadComponents(ids: BitId[]): Promise<Component> {
    const bitMap = await this.getBitMap();

    const fullDependenciesTree = {
      tree: {},
      missing: []
    };
    // Map to store the id's of paths we already found in bit.map
    // It's aim is to reduce the search in the bit.map for dependencies ids because it's an expensive operation
    const dependenciesPathIdMap = new Map();

    const driverExists = this.warnForMissingDriver('Warning: Bit is not be able calculate the dependencies tree. Please install bit-{lang} driver and run commit again.');

    const components = ids.map(async (id) => {
      let dependenciesTree = {};
      const dependencies = [];

      const componentMap = bitMap.getComponent(id.toString());
      let bitDir;
      // TODO: Take this from the map (the most up path of all component files)
      // TODO: Taking it from compose will not work when someone will import with -p to specific path
      if (componentMap.origin === COMPONENT_ORIGINS.IMPORTED || componentMap.origin === COMPONENT_ORIGINS.NESTED) {
        bitDir = this.composeBitPath(id);
        return Component.loadFromFileSystem(bitDir, this.bitJson, componentMap, id, this.getPath());
      }

      const component = Component.loadFromFileSystem(bitDir, this.bitJson, componentMap, id, this.getPath());
      if (component.dependencies) return component; // if there is bit.json use if for dependencies.
      const mainFile = componentMap.files[componentMap.mainFile];
      // Check if we already calculate the dependency tree (because it is another component dependency)
      if (fullDependenciesTree.tree[id]) {
        // If we found it in the full tree it means we already take care of the missings earlier
        dependenciesTree.missing = [];
      } else if (driverExists){
        // Load the dependencies through automatic dependency resolution
        dependenciesTree = await this.driver.getDependencyTree(this.getPath(), mainFile);
        Object.assign(fullDependenciesTree.tree, dependenciesTree.tree);
        fullDependenciesTree.missing = fullDependenciesTree.missing.concat(dependenciesTree.missing);
        // Check if there is missing dependencies in file system
        // TODO: Decide if we want to throw error once there is missing or only in the end
        if (!R.isEmpty(dependenciesTree.missing)) throw (new MissingDependenciesOnFs(dependenciesTree.missing));
      }

      // We only care of the relevant sub tree from now on
      // We can be sure it's now exists because it's happen after the assign in case it was missing
      dependenciesTree.tree = fullDependenciesTree.tree[mainFile] || {};

      const dependenciesMissingInMap = [];
      const files = dependenciesTree.tree.files || [];
      files.forEach((filePath) => {
        // Trying to get the idString from map first
        const dependencyIdString = dependenciesPathIdMap.get(filePath) || bitMap.getComponentIdByPath(filePath);

        // Check if there is missing dependencies (dependencies which exist in file system but not added to bit.map)
        if (!dependencyIdString) {
          dependenciesMissingInMap.push(filePath);
        } else {
          // Add the entry to cache map
          dependenciesPathIdMap.set(filePath, dependencyIdString);
          let dependencyId = BitId.parse(dependencyIdString);
          dependencyId = dependencyId.scope ? dependencyId : dependencyId.changeScope(this.scope.name);
          dependencies.push(dependencyId);
        }
      });
      if (!R.isEmpty(dependenciesMissingInMap)) throw new MissingDependencies([dependenciesMissingInMap]);

      // TODO: add the bit/ dependenices as well
      component.dependencies = dependencies;
      component.packageDependencies = dependenciesTree.tree.packages || {};
      return component;
    });

    return Promise.all(components);
  }

  exportAction(rawId: string, rawRemote: string) {
    // @TODO - move this method to api, not related to consumer
    const bitId = BitId.parse(rawId);

    return this.scope.exportAction(bitId, rawRemote)
      .then(componentDependencies => componentDependencies.component);
  }

  async importAccordingToConsumerBitJson(verbose?: bool, withEnvironments: ?bool,
                                         cache?: bool = true): Promise<> {
    const dependencies = BitIds.fromObject(this.bitJson.dependencies);
    if (R.isNil(dependencies) || R.isEmpty(dependencies)) {
      if (!withEnvironments) {
        return Promise.reject(new NothingToImport());
      } else if (R.isNil(this.testerId) || R.isNil(this.compilerId)) {
        return Promise.reject(new NothingToImport());
      }
    }

    const componentDependenciesArr = await this.scope.getMany(dependencies, cache);
    await this.writeToComponentsDir(componentDependenciesArr);
    if (withEnvironments) {
      const envComponents = this.scope.installEnvironment({
        ids: [this.testerId, this.compilerId],
        consumer: this,
        verbose
      });
      return {
        dependencies: componentDependenciesArr,
        envDependencies: envComponents,
      };
    }
    return { dependencies: componentDependenciesArr };
  }

  async importSpecificComponents(rawIds: ?string[], cache?: boolean, writeToPath?: string) {
    logger.debug(`importSpecificComponents, Ids: ${rawIds.join(', ')}`);
    // $FlowFixMe - we check if there are bitIds before we call this function
    const bitIds = rawIds.map(raw => BitId.parse(raw, this.scope.name));
    const componentDependenciesArr = await this.scope.getMany(bitIds, cache);
    await this.writeToComponentsDir(componentDependenciesArr, writeToPath);
    return { dependencies: componentDependenciesArr };
  }


  import(rawIds: ?string[], verbose?: bool, withEnvironments: ?bool, cache?: bool = true,
         writeToPath?: string):
  Promise<{ dependencies: ComponentDependencies[], envDependencies?: Component[] }> {
    loader.start(BEFORE_IMPORT_ACTION);
    if (!rawIds || R.isEmpty(rawIds)) {
      return this.importAccordingToConsumerBitJson(verbose, withEnvironments, cache);
    }
    return this.importSpecificComponents(rawIds, cache, writeToPath);
  }

  importEnvironment(rawId: ?string, verbose?: bool) {
    if (!rawId) { throw new Error('you must specify bit id for importing'); } // @TODO - make a normal error message
    const bitId = BitId.parse(rawId, this.scope.name);
    return this.scope.installEnvironment({ ids: [bitId], consumer: this, verbose })
      .then((envDependencies) => {
        // todo: do we need the environment in bit.map?
        // this.bitMap.addComponent(bitId.toString(), this.composeRelativeBitPath(bitId));
        // this.bitMap.write();
        return envDependencies;
      });
  }

  removeFromComponents(id: BitId, currentVersionOnly: boolean = false): Promise<any> {
    const componentsDir = this.getComponentsPath();
    const componentDir = path.join(
      componentsDir,
      id.box,
      id.name,
      id.scope,
      currentVersionOnly ? id.version : ''
    );

    return new Promise((resolve, reject) => {
      return fs.remove(componentDir, (err) => {
        if (err) return reject(err);
        return resolve();
      });
    });
  }

  /**
   * write the component into '/component' dir (or according to the bit.map) and its
   * dependencies nested inside the component directory and under 'dependencies' dir.
   * For example: global/a has a dependency my-scope/global/b::1. The directories will be:
   * project/root/component/global/a
   * project/root/component/global/a/dependency/global/b/my-scope/version-num/1
   *
   * In case there are some same dependencies shared between the components, it makes sure to
   * write them only once.
   */
  async writeToComponentsDir(componentDependencies: ComponentDependencies[], writeToPath?: string):
  Promise<Component[]> {
    const bitMap: BitMap = await this.getBitMap();
    const dependenciesIds = [];
    return Promise.all(componentDependencies.map((componentWithDeps) => {
      const bitPath = writeToPath || this.composeBitPath(componentWithDeps.component.id);
      const writeComponentP = componentWithDeps.component.write(bitPath, true, true, bitMap, COMPONENT_ORIGINS.AUTHORED);
      const writeDependenciesP = componentWithDeps.dependencies.map((dep: Component) => {
        const dependencyId = dep.id.toString();
        if (bitMap.isComponentExist(dependencyId) || dependenciesIds.includes(dependencyId)) {
          logger.debug(`writeToComponentsDir, ignore dependency ${dependencyId} as it already exists`);
          return Promise.resolve();
        }
        dependenciesIds.push(dependencyId);
        const depBitPath = path.join(bitPath, DEPENDENCIES_DIR, dep.id.toFullPath());
        return dep.write(depBitPath, true, true, bitMap, COMPONENT_ORIGINS.NESTED);
      });
      return Promise.all([writeComponentP, ...writeDependenciesP]);
    }));
  }

  async commit(id: string, message: string, force: ?bool, verbose: ?bool): Promise<Component> {
    const bitId = BitId.parse(id);
    const bitMap: BitMap = await this.getBitMap();
    if (!bitMap.isComponentExist(bitId)) {
      throw new Error(`Unable to find a component ${bitId} in your bit.map file. Consider "bit add" it`);
    }
    const component = await this.loadComponent(bitId);
    await this.scope
      .putMany({ consumerComponents: [component], message, force, consumer: this, verbose });
    await this.driver.runHook('onCommit', [component]); // todo: probably not needed as the bind happens on create
    return component;
  }

  async commitAll(ids: string[], message: string, force: ?bool, verbose: ?bool): Promise<Component> {
    const componentsList = new ComponentsList(this);
    let commitPendingComponents;
    try{
      commitPendingComponents = await componentsList.listCommitPendingComponents();
    } catch (err){
      console.log(err);
      console.log(err.message);
      throw err;
    }
    const componentsIds = commitPendingComponents.map(BitId.parse);
    if (R.isEmpty(componentsIds)) return;

    const bitMap: BitMap = await this.getBitMap();

    // load components
    let components;
    try{
      components = await this.loadComponents(componentsIds);
    } catch (err){
      console.log(err);
      console.log(err.message);
      throw err;
    }

    await this.scope
      .putMany({ consumerComponents: components, message, force, consumer: this, verbose });
    await this.driver.runHook('onCommit', components); // todo: probably not needed as the bind happens on create
    return components;
  }

  composeRelativeBitPath(bitId: BitId): string {
    const { staticParts, dynamicParts } = this.dirStructure.componentsDirStructure;
    const dynamicDirs = dynamicParts.map(part => bitId[part]);
    const addToPath = [...staticParts, ...dynamicDirs];
    return path.join(...addToPath);
  }

  composeBitPath(bitId: BitId): string {
    const addToPath = [this.getPath(), this.composeRelativeBitPath(bitId)];
    logger.debug(`component dir path: ${addToPath.join('/')}`);
    return path.join(...addToPath);
  }

  runComponentSpecs(id: BitId, verbose: boolean = false): Promise<?any> {
    return this.loadComponent(id)
      .then((component) => {
        return component.runSpecs({ scope: this.scope, consumer: this, verbose });
      });
  }

  listInline(): Promise<Component[]> {
    return new Promise((resolve, reject) =>
      glob(path.join('*', '*'), { cwd: this.getInlineBitsPath() }, (err, files) => {
        if (err) reject(err);

        const bitsP = files.map((bitRawId) => {
          const parsedId = BitInlineId.parse(bitRawId);
          return this.loadComponent(parsedId);
        });

        return Promise.all(bitsP)
        .then(resolve)
        .catch(reject);
      })
    );
  }

  includes({ inline, bitName }: { inline: ?boolean, bitName: string }): Promise<boolean> {
    const dirToCheck = inline ? this.getInlineBitsPath() : this.getComponentsPath();

    return new Promise((resolve) => {
      return fs.stat(path.join(dirToCheck, bitName), (err) => {
        if (err) return resolve(false);
        return resolve(true);
      });
    });
  }

  static create(projectPath: string = process.cwd()): Promise<Consumer> {
    if (pathHasConsumer(projectPath)) return Promise.reject(new ConsumerAlreadyExists());
    return this.ensure(projectPath);
  }

  static ensure(projectPath: string = process.cwd()): Promise<Consumer> {
    const scopeP = Scope.ensure(path.join(projectPath, BIT_HIDDEN_DIR));
    const bitJsonP = ConsumerBitJson.ensure(projectPath);

    return Promise.all([scopeP, bitJsonP])
    .then(([scope, bitJson]) => {
      return new Consumer({
        projectPath,
        created: true,
        scope,
        bitJson
      });
    });
  }

  static load(currentPath: string): Promise<Consumer> {
    return new Promise((resolve, reject) => {
      const projectPath = locateConsumer(currentPath);
      if (!projectPath) return reject(new ConsumerNotFound());
      const scopeP = Scope.load(path.join(projectPath, BIT_HIDDEN_DIR));
      const bitJsonP = ConsumerBitJson.load(projectPath);
      return Promise.all([scopeP, bitJsonP])
      .then(([scope, bitJson]) =>
        resolve(
          new Consumer({
            projectPath,
            bitJson,
            scope
          })
        )
      );
    });
  }
}
