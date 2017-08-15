/** @flow */
import path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import chalk from 'chalk';
import format from 'string-format';
import { locateConsumer, pathHasConsumer } from './consumer-locator';
import {
  ConsumerAlreadyExists,
  ConsumerNotFound,
  NothingToImport,
  MissingDependencies
} from './exceptions';
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
  DEFAULT_DIST_DIRNAME,
  DEFAULT_INDEX_NAME,
  DEFAULT_INDEX_TS_NAME
} from '../constants';
import { Scope, ComponentWithDependencies } from '../scope';
import loader from '../cli/loader';
import { BEFORE_IMPORT_ACTION } from '../cli/loader/loader-messages';
import BitMap from './bit-map/bit-map';
import logger from '../logger/logger';
import DirStructure from './dir-structure/dir-structure';
import { outputFile, getLatestVersionNumber } from '../utils';

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
  warnForMissingDriver(msg): boolean {
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

  getComponentsPath(): string {
    return path.join(this.projectPath, BITS_DIRNAME);
  }

  getPath(): string {
    return this.projectPath;
  }

  async loadComponent(id: BitId): Promise<Component> {
    const components = await this.loadComponents([id]);
    return components[0];
  }

  async loadComponents(ids: BitId[]): Promise<Component> {
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

    const fullDependenciesTree = {
      tree: {},
      missing: {
        files: [],
        packages: [],
        bits: []
      }
    };

    const depsTreeCache = {};

    /**
     * Run over the deps tree recursively to build the full deps tree for component
     * @param {Object} tree - which contain direct deps for each file
     * @param {string} file - file to calculate deps for
     * @param {string} entryComponentId - component id for the entry of traversing - used to know which of the files are part of that component
     */
    const traverseDepsTreeRecursive = (tree: Object, file: string, entryComponentId: string): Object => {
      const depsTreeCacheId = `${file}@${entryComponentId}`;
      if (depsTreeCache[depsTreeCacheId] === null) return {}; // todo: cyclomatic dependency
      if (depsTreeCache[depsTreeCacheId]) {
        return depsTreeCache[depsTreeCacheId];
      }
      depsTreeCache[depsTreeCacheId] = null; // mark as started

      const packagesDeps = {};
      let missingDeps = [];
      let destination;

      // Don't traverse generated authored components (from the same reasons above):
      let componentId = bitMap.getComponentIdByPath(file);
      if (!componentId) {
        // Check if its a generated index file
        if (path.basename(file) === DEFAULT_INDEX_NAME || path.basename(file) === 'index.ts') {
          const indexDir = path.dirname(file);
          componentId = bitMap.getComponentIdByRootPath(indexDir);
          // Refer to the main file in case the source component required the index of the imported
          if (componentId) destination = bitMap.getMainFileOfComponent(componentId);
        }

        if (!componentId) {
          missingDeps.push(file);
          depsTreeCache[depsTreeCacheId] = { componentsDeps: {}, packagesDeps, missingDeps };
          return ({ componentsDeps: {}, packagesDeps, missingDeps });
        }
      }
      if (componentId === entryComponentId) {
        const currPackagesDeps = tree[file].packages;
        if (currPackagesDeps && !R.isEmpty(currPackagesDeps)) {
          Object.assign(packagesDeps, currPackagesDeps);
        }
        const allFilesDpes = tree[file].files;
        if (!allFilesDpes || R.isEmpty(allFilesDpes)) {
          depsTreeCache[depsTreeCacheId] = { componentsDeps: {}, packagesDeps, missingDeps };
          return { componentsDeps: {}, packagesDeps, missingDeps };
        }
        const recursiveResults = allFilesDpes.map(fileDep => traverseDepsTreeRecursive(tree, fileDep, entryComponentId));
        const currComponentsDeps = {};
        recursiveResults.forEach((result) => {
          // componentsDeps = componentsDeps.concat(result.componentsDeps);
          if (result.componentsDeps && !R.isEmpty(result.componentsDeps)) {
            Object.keys(result.componentsDeps).forEach((currId) => {
              const resultPaths = result.componentsDeps[currId];
              if (currComponentsDeps[currId]) {
                currComponentsDeps[currId] = currComponentsDeps[currId].concat(resultPaths);
              } else {
                currComponentsDeps[currId] = resultPaths;
              }
            });
          }
          if (result.missingDeps && !R.isEmpty(result.missingDeps)){
            missingDeps = missingDeps.concat(result.missingDeps);
          }
          Object.assign(packagesDeps, result.packagesDeps);
        });
        depsTreeCache[depsTreeCacheId] = { componentsDeps: currComponentsDeps, packagesDeps, missingDeps };
        return { componentsDeps: currComponentsDeps, packagesDeps, missingDeps };
      }

      if (!destination) {
        const depRootDir = bitMap.getRootDirOfComponent(componentId);
        destination = depRootDir ? path.relative(depRootDir, file) : file;
      }

      const currComponentsDeps = { [componentId]: [{ sourceRelativePath: file, destinationRelativePath: destination }] };
      depsTreeCache[depsTreeCacheId] = { componentsDeps: currComponentsDeps, packagesDeps: {}, missingDeps: [] };
      return ({ componentsDeps: currComponentsDeps, packagesDeps: {}, missingDeps: [] });
    };

    const driverExists = this.warnForMissingDriver('Warning: Bit is not be able calculate the dependencies tree. Please install bit-{lang} driver and run commit again.');

    const components = idsToProcess.map(async (id: BitId) => {
      let dependenciesTree = {};
      const idWithConcreteVersionString = getLatestVersionNumber(Object.keys(bitMap.getAllComponents()), id.toString());
      const idWithConcreteVersion = BitId.parse(idWithConcreteVersionString);

      const componentMap = bitMap.getComponent(idWithConcreteVersion, true);
      let bitDir = this.getPath();

      if (componentMap && componentMap.rootDir) {
        bitDir = path.join(bitDir, componentMap.rootDir);
      }

      if (componentMap && componentMap.origin === COMPONENT_ORIGINS.NESTED) {
        return Component.loadFromFileSystem(bitDir, this.bitJson, componentMap, idWithConcreteVersion, this.getPath());
      }

      const component = Component.loadFromFileSystem(bitDir, this.bitJson, componentMap, idWithConcreteVersion, this.getPath());
      if (component.dependencies && !R.isEmpty(component.dependencies)) return component; // if there is bit.json use if for dependencies.
      const mainFile = componentMap.mainFile;
      component.missingDependencies = {};
      // Check if we already calculate the dependency tree (because it is another component dependency)
      if (fullDependenciesTree.tree[idWithConcreteVersion]) {
        // If we found it in the full tree it means we already take care of the missings earlier
        dependenciesTree.missing = {
          files: [],
          packages: [],
          bits: []
        };
      } else if (driverExists) {
        // Load the dependencies through automatic dependency resolution
        dependenciesTree = await this.driver.getDependencyTree(bitDir, this.getPath(), mainFile);
        Object.assign(fullDependenciesTree.tree, dependenciesTree.tree);
        if (dependenciesTree.missing.files) fullDependenciesTree.missing.files = fullDependenciesTree.missing.files.concat(dependenciesTree.missing.files);
        if (dependenciesTree.missing.packages) fullDependenciesTree.missing.packages = fullDependenciesTree.missing.packages.concat(dependenciesTree.missing.packages);
        if (dependenciesTree.missing.bits) fullDependenciesTree.missing.bits = fullDependenciesTree.missing.bits.concat(dependenciesTree.missing.bits);

        // Check if there is missing dependencies in file system
        // Add missingDependenciesOnFs to component
        if (dependenciesTree.missing.files && !R.isEmpty(dependenciesTree.missing.files)) component.missingDependencies.missingDependenciesOnFs = dependenciesTree.missing.files;
        // Add missingPackagesDependenciesOnFs to component
        if (dependenciesTree.missing.packages && !R.isEmpty(dependenciesTree.missing.packages)) component.missingDependencies.missingPackagesDependenciesOnFs = dependenciesTree.missing.packages;
      }

      // We only care of the relevant sub tree from now on
      // We can be sure it's now exists because it's happen after the assign in case it was missing
      const traversedDeps = traverseDepsTreeRecursive(fullDependenciesTree.tree, mainFile, idWithConcreteVersion.toString());
      const traveresedCompDeps = traversedDeps.componentsDeps;
      const dependencies = Object.keys(traveresedCompDeps).map((depId) => {
        return { id: BitId.parse(depId), relativePaths: traveresedCompDeps[depId] };
      });
      const packages = traversedDeps.packagesDeps;
      const missingDependencies = traversedDeps.missingDeps;


      if (!R.isEmpty(missingDependencies)) component.missingDependencies.untrackedDependencies = missingDependencies;

      // TODO: add the bit/ dependencies as well
      component.dependencies = dependencies;
      component.packageDependencies = packages;
      return component;
    });

    const allComponents = [];
    for (const componentP of components) { // load the components one after another (not in parallel).
      const component = await componentP;
      this._componentsCache[component.id.toString()] = component;
      logger.debug(`Finished loading the component, ${component.id.toString()}`);
      allComponents.push(component);
    }

    return allComponents.concat(alreadyLoadedComponents);
  }

  async importAccordingToBitJsonAndBitMap(verbose?: bool, withEnvironments: ?bool,
                                          cache?: bool = true): Promise<> {
    const dependenciesFromBitJson = BitIds.fromObject(this.bitJson.dependencies);
    const bitMap = await this.getBitMap();
    const componentsFromBitMap = bitMap.getAllComponents(COMPONENT_ORIGINS.AUTHORED);

    if ((R.isNil(dependenciesFromBitJson) || R.isEmpty(dependenciesFromBitJson)) && R.isEmpty(componentsFromBitMap)) {
      if (!withEnvironments) {
        return Promise.reject(new NothingToImport());
      } else if (R.isNil(this.testerId) && R.isNil(this.compilerId)) {
        return Promise.reject(new NothingToImport());
      }
    }
    let componentsAndDependenciesBitJson;
    let componentsAndDependenciesBitMap;
    if (dependenciesFromBitJson) {
      componentsAndDependenciesBitJson = await this.scope.getManyWithAllVersions(dependenciesFromBitJson, cache);
      await this.writeToComponentsDir(componentsAndDependenciesBitJson);
    }
    if (componentsFromBitMap) {
      const componentsIds = Object.keys(componentsFromBitMap);
      const componentsIdsParsed = componentsIds.map(id => BitId.parse(id));
      componentsAndDependenciesBitMap = await this.scope.getManyWithAllVersions(componentsIdsParsed, cache);
      await this.writeToComponentsDir(componentsAndDependenciesBitMap, undefined, false);
    }
    const componentsAndDependencies = [...componentsAndDependenciesBitJson, ...componentsAndDependenciesBitMap];
    if (withEnvironments) {
      const envComponents = await this.scope.installEnvironment({
        ids: [this.testerId, this.compilerId],
        consumer: this,
        verbose
      });
      return {
        dependencies: componentsAndDependencies,
        envDependencies: envComponents,
      };
    }
    return { dependencies: componentsAndDependencies };
  }

  async importSpecificComponents(rawIds: ?string[], cache?: boolean, writeToPath?: string) {
    logger.debug(`importSpecificComponents, Ids: ${rawIds.join(', ')}`);
    // $FlowFixMe - we check if there are bitIds before we call this function
    const bitIds = rawIds.map(raw => BitId.parse(raw, this.scope.name));
    const componentDependenciesArr = await this.scope.getManyWithAllVersions(bitIds, cache);
    await this.writeToComponentsDir(componentDependenciesArr, writeToPath);
    return { dependencies: componentDependenciesArr };
  }


  import(rawIds: ?string[], verbose?: bool, withEnvironments: ?bool, cache?: bool = true,
         writeToPath?: string):
  Promise<{ dependencies: ComponentWithDependencies[], envDependencies?: Component[] }> {
    loader.start(BEFORE_IMPORT_ACTION);
    if (!rawIds || R.isEmpty(rawIds)) {
      return this.importAccordingToBitJsonAndBitMap(verbose, withEnvironments, cache);
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

  // todo: move to bit-javascript
  _getIndexFileName(mainFile: string): string {
    if (path.extname(mainFile) === '.ts') {
      return DEFAULT_INDEX_TS_NAME;
    }
    return DEFAULT_INDEX_NAME;
  }

  // todo: move to bit-javascript
  _getLinkContent(mainFile: string, filePath: string): string {
    filePath = filePath.substring(0, filePath.lastIndexOf('.')); // remove the extension
    if (path.extname(mainFile) === '.ts') {
      return `export * from '${filePath}';`;
    }
    return `module.exports = require('${filePath}');`;
  }

  async _writeEntryPointsForImportedComponent(component: Component, bitMap: BitMap):
  Promise<any> {
    const componentRoot = component.writtenPath;
    const componentId = component.id.toString();
    let mainFile = bitMap.getMainFileOfComponent(componentId); // TODO: get main dist in case it exists?
    // In case there is dist files, we want to point the index to the dist file not to source.
    if (component.dists && !R.isEmpty(component.dists)) {
      logger.debug('_writeEntryPointsForImportedComponent, Change the index file to point to dist folder');
      mainFile = path.join(DEFAULT_DIST_DIRNAME, mainFile);
    }
    const indexName = this._getIndexFileName(mainFile); // Move to bit-javascript
    const entryPointFileContent = this._getLinkContent(mainFile, `.${path.sep}${mainFile}`);
    const entryPointPath = path.join(componentRoot, indexName);
    return outputFile(entryPointPath, entryPointFileContent);
  }

  /**
   * The following scenario will help understanding why links are needed.
   * Component A has a dependency B. (for instance, in a.js there is a require statement to 'b.js').
   * While importing component A, it knows about the B dependency and it saves it under 'dependencies' directory of A.
   * The problem is that the above require is broken, because 'b.js' is not in the same place where it was originally.
   * This function solves this issue by creating the 'b.js' file in the original location and points to the new location
   * under 'dependencies' of A.
   */
  async _writeDependencyLinks(componentDependencies: ComponentWithDependencies[], bitMap: BitMap): Promise<any> {
    const writeLinkFile = (componentId: string, linkPath: string, relativePathInDependency: string) => {
      const rootDir = bitMap.getRootDirOfComponent(componentId);
      const mainFile = bitMap.getMainFileOfComponent(componentId);
      let actualFilePath = path.join(rootDir, relativePathInDependency);
      if (relativePathInDependency === mainFile) {
        actualFilePath = path.join(rootDir, this._getIndexFileName(mainFile));
      }
      const relativeFilePath = path.relative(path.dirname(linkPath), actualFilePath);
      const linkContent = this._getLinkContent(mainFile, relativeFilePath);
      return outputFile(linkPath, linkContent);
    };

    const componentLink = async (resolveDepVersion: string, sourceRelativePath: string, relativePathInDependency: string,
                                 parentDir: string, hasDist: boolean) => {
      const linkPath = path.join(parentDir, sourceRelativePath);
      let distLinkPath;
      if (hasDist) {
        distLinkPath = path.join(parentDir, DEFAULT_DIST_DIRNAME, sourceRelativePath);
      }

      // Generate a link file inside dist folder of the dependent component
      if (hasDist) {
        writeLinkFile(resolveDepVersion, distLinkPath, relativePathInDependency);
      }

      return writeLinkFile(resolveDepVersion, linkPath, relativePathInDependency);
    };

    const componentLinks = (directDependencies: Array<Object>, flattenedDependencies: BitIds, parentDir: string,
                            hasDist: boolean) => {
      if (!directDependencies || !directDependencies.length) return Promise.resolve();
      const links = directDependencies.map((dep) => {
        if (!dep.relativePath && (!dep.relativePaths || R.isEmpty(dep.relativePaths))) return Promise.resolve();
        let resolveDepVersion = dep.id;
        // Check if the dependency is latest, if yes we need to resolve if from the flatten dependencies to get the
        // Actual version number, because on the bitmap we have only specific versions
        if (dep.id.getVersion().latest) {
          resolveDepVersion = flattenedDependencies.resolveVersion(dep.id).toString();
        }

        const currLinks = dep.relativePaths.map((relativePath) => {
          return componentLink(resolveDepVersion, relativePath.sourceRelativePath, relativePath.destinationRelativePath, parentDir, hasDist);
        });
        return Promise.all(currLinks);
      });
      return Promise.all(links);
    };

    const allLinksP = componentDependencies.map((componentWithDeps) => {
      const directDeps = componentWithDeps.component.dependencies;
      const flattenDeps = componentWithDeps.component.flattenedDependencies;
      const hasDist = componentWithDeps.component.dists && !R.isEmpty(componentWithDeps.component.dists);
      const directLinksP = componentLinks(directDeps, flattenDeps, componentWithDeps.component.writtenPath, hasDist);

      const indirectLinksP = componentWithDeps.dependencies.map((dep: Component) => {
        const hasDist = dep.dists && !R.isEmpty(dep.dists);
        return componentLinks(dep.dependencies, dep.flattenedDependencies, dep.writtenPath, hasDist);
      });

      return Promise.all([directLinksP, ...indirectLinksP]);
    });
    return Promise.all(allLinksP);
  }

  /**
   * write the components into '/component' dir (or according to the bit.map) and its
   * dependencies nested inside the component directory and under 'dependencies' dir.
   * For example: global/a has a dependency my-scope/global/b@1. The directories will be:
   * project/root/component/global/a/impl.js
   * project/root/component/global/a/dependency/global/b/my-scope/1/impl.js
   *
   * In case there are some same dependencies shared between the components, it makes sure to
   * write them only once.
   */
  async writeToComponentsDir(componentDependencies: ComponentWithDependencies[], writeToPath?: string,
                             force?: boolean = true): Promise<Component[]> {
    const bitMap: BitMap = await this.getBitMap();
    const dependenciesIds = [];
    const allComponentsP = componentDependencies.map((componentWithDeps) => {
      const bitPath = writeToPath || this.composeBitPath(componentWithDeps.component.id);
      componentWithDeps.component.writtenPath = bitPath;
      const writeComponentP = componentWithDeps.component
        .write({ bitDir: bitPath, force, bitMap, origin: COMPONENT_ORIGINS.IMPORTED, consumerPath: this.getPath() });
      const writeDependenciesP = componentWithDeps.dependencies.map((dep: Component) => {
        const dependencyId = dep.id.toString();
        const depFromBitMap = bitMap.getComponent(dependencyId, false);
        if (depFromBitMap) {
          dep.writtenPath = depFromBitMap.rootDir;
          logger.debug(`writeToComponentsDir, ignore dependency ${dependencyId} as it already exists in bit map`);
          return Promise.resolve();
        }

        if (dependenciesIds[dependencyId]) {
          logger.debug(`writeToComponentsDir, ignore dependency ${dependencyId} as it already exists in cache`);
          dep.writtenPath = dependenciesIds[dependencyId];
          return Promise.resolve();
        }

        const depBitPath = path.join(bitPath, DEPENDENCIES_DIR, dep.id.toFullPath());
        dep.writtenPath = depBitPath;
        dependenciesIds[dependencyId] = depBitPath;
        return dep.write({ bitDir: depBitPath,
          force,
          bitMap,
          origin: COMPONENT_ORIGINS.NESTED,
          parent: componentWithDeps.component.id,
          consumerPath: this.getPath() })
          .then(() => this._writeEntryPointsForImportedComponent(dep, bitMap));
      });

      return Promise.all([writeComponentP, ...writeDependenciesP]);
    });
    const allComponents = await Promise.all(allComponentsP);
    await this._writeDependencyLinks(componentDependencies, bitMap);
    await Promise.all(componentDependencies.map(componentWithDependencies =>
      this._writeEntryPointsForImportedComponent(componentWithDependencies.component, bitMap)
    ));
    await bitMap.write();
    return allComponents;
  }

  async bumpDependenciesVersions(committedComponents: Component[]) {
    const bitMap = await this.getBitMap();
    const authoredComponents = bitMap.getAllComponents(COMPONENT_ORIGINS.AUTHORED);
    if (!authoredComponents) return null;
    const committedComponentsWithoutVersions = committedComponents
      .map(committedComponent => committedComponent.id.toStringWithoutVersion());
    const authoredComponentsIds = Object.keys(authoredComponents).map(id => BitId.parse(id));
    // if a committed component is in authored array, remove it from the array as it has already been committed with the correct version
    const componentsToUpdate = authoredComponentsIds.filter(component => !committedComponentsWithoutVersions
      .includes(component.toStringWithoutVersion()));
    return this.scope.bumpDependenciesVersions(componentsToUpdate, committedComponents);
  }

  async commit(ids: BitId[], message: string, force: ?bool, verbose: ?bool): Promise<Component[]> {
    logger.debug(`committing the following components: ${ids.join(', ')}`);
    const componentsIds = ids.map(componentId => BitId.parse(componentId));
    const components = await this.loadComponents(componentsIds);
    // Run over the components to check if there is missing depenedencies
    // If there is at least one we won't commit anything
    const componentsWithMissingDeps = components.filter((component) => {
      return (component.missingDependencies && !R.isEmpty(component.missingDependencies));
    });
    if (!R.isEmpty(componentsWithMissingDeps)) throw new MissingDependencies(componentsWithMissingDeps);


    const committedComponents = await this.scope
       .putMany({ consumerComponents: components, message, force, consumer: this, verbose });
    await this.bumpDependenciesVersions(committedComponents);

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
    // TODO: Refactor - remove the new Promise((resolve, reject) it's a bad practice use Promise.reject if needed
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
