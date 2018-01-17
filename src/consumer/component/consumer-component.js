// @flow
import path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import { mkdirp, isString, pathNormalizeToLinux, searchFilesIgnoreExt } from '../../utils';
import BitJson from '../bit-json';
import { Impl, Specs, Dist, License, SourceFile } from '../component/sources';
import ConsumerBitJson from '../bit-json/consumer-bit-json';
import Consumer from '../consumer';
import BitId from '../../bit-id/bit-id';
import Scope from '../../scope/scope';
import BitIds from '../../bit-id/bit-ids';
import docsParser, { Doclet } from '../../jsdoc/parser';
import specsRunner from '../../specs-runner';
import SpecsResults from '../specs-results';
import ComponentSpecsFailed from '../exceptions/component-specs-failed';
import BuildException from './exceptions/build-exception';
import MissingFilesFromComponent from './exceptions/missing-files-from-component';
import ComponentNotFoundInPath from './exceptions/component-not-found-in-path';
import IsolatedEnvironment, { IsolateOptions } from '../../environment';
import type { Log } from '../../scope/models/version';
import { ResolutionException } from '../../scope/exceptions';
import BitMap from '../bit-map';
import type { ComponentMapFile } from '../bit-map/component-map';
import ComponentMap from '../bit-map/component-map';
import logger from '../../logger/logger';
import loader from '../../cli/loader';
import { Driver } from '../../driver';
import { BEFORE_IMPORT_ENVIRONMENT, BEFORE_RUNNING_SPECS } from '../../cli/loader/loader-messages';
import FileSourceNotFound from './exceptions/file-source-not-found';
import { writeLinksInDist } from '../../links';
import { Component as ModelComponent } from '../../scope/models';
import {
  DEFAULT_BOX_NAME,
  LATEST_BIT_VERSION,
  NO_PLUGIN_TYPE,
  DEFAULT_LANGUAGE,
  DEFAULT_BINDINGS_PREFIX,
  COMPONENT_ORIGINS,
  DEFAULT_DIST_DIRNAME,
  BIT_JSON
} from '../../constants';
import ComponentWithDependencies from '../../scope/component-dependencies';
import * as packageJson from './package-json';

export type RelativePath = {
  sourceRelativePath: string,
  destinationRelativePath: string,
  importSpecifiers?: Object
};

export type Dependency = {
  id: BitId,
  relativePaths: RelativePath[]
};

export type ComponentProps = {
  name: string,
  box: string,
  version?: ?string,
  scope?: ?string,
  lang?: string,
  bindingPrefix?: string,
  mainFile?: string,
  compilerId?: ?BitId,
  testerId?: ?BitId,
  dependencies?: Dependency[],
  flattenedDependencies?: ?BitIds,
  packageDependencies?: ?Object,
  files?: ?(SourceFile[]) | [],
  docs?: ?(Doclet[]),
  dists?: ?(Dist[]),
  specsResults?: ?SpecsResults,
  license?: ?License,
  log?: ?Log
};

export default class Component {
  name: string;
  box: string;
  version: ?string;
  scope: ?string;
  lang: string;
  bindingPrefix: string;
  mainFile: string;
  compilerId: ?BitId;
  testerId: ?BitId;
  dependencies: Dependency[];
  flattenedDependencies: BitIds;
  packageDependencies: Object;
  _docs: ?(Doclet[]);
  _files: ?(SourceFile[]) | [];
  dists: ?(Dist[]);
  specsResults: ?(SpecsResults[]);
  license: ?License;
  log: ?Log;
  writtenPath: ?string; // needed for generate links
  dependenciesSavedAsComponents: ?boolean = true; // otherwise they're saved as npm packages
  originallySharedDir: ?string; // needed to reduce a potentially long path that was used by the author
  _wasOriginallySharedDirStripped: ?boolean; // whether stripOriginallySharedDir() method had been called, we don't want to strip it twice
  _writeDistsFiles: ?boolean = true;
  _areDistsInsideComponentDir: ?boolean = true;
  isolatedEnvironment: IsolatedEnvironment;
  missingDependencies: ?Object;
  deprecated: boolean;
  _driver: Driver;
  _isModified: boolean;

  set files(val: ?(SourceFile[])) {
    this._files = val;
  }

  get files(): ?(SourceFile[]) {
    if (!this._files) return null;
    if (this._files instanceof Array) return this._files;

    if (R.is(Object, this._files)) {
      // $FlowFixMe
      this._files = SourceFile.load(this._files);
    }
    // $FlowFixMe
    return this._files;
  }

  get id(): BitId {
    // if (!this.scope || !this.version) {
    //   console.error(this);
    //   throw new Error('cant produce id because scope or version are missing');
    // }

    return new BitId({
      scope: this.scope,
      box: this.box,
      name: this.name,
      version: this.version
    });
  }

  get docs(): ?(Doclet[]) {
    if (!this._docs) {
      this._docs = this.files
        ? R.flatten(this.files.map(file => docsParser(file.contents.toString(), file.relative)))
        : [];
    }
    return this._docs;
  }

  get driver(): Driver {
    if (!this._driver) {
      this._driver = Driver.load(this.lang);
    }
    return this._driver;
  }

  constructor({
    name,
    box,
    version,
    scope,
    lang,
    bindingPrefix,
    mainFile,
    compilerId,
    testerId,
    dependencies,
    flattenedDependencies,
    packageDependencies,
    files,
    docs,
    dists,
    specsResults,
    license,
    log,
    deprecated
  }: ComponentProps) {
    this.name = name;
    this.box = box || DEFAULT_BOX_NAME;
    this.version = version;
    this.scope = scope;
    this.lang = lang || DEFAULT_LANGUAGE;
    this.bindingPrefix = bindingPrefix || DEFAULT_BINDINGS_PREFIX;
    this.mainFile = mainFile;
    this.compilerId = compilerId;
    this.testerId = testerId;
    this.dependencies = dependencies || [];
    this.flattenedDependencies = flattenedDependencies || new BitIds();
    this.packageDependencies = packageDependencies || {};
    this._files = files;
    this._docs = docs;
    this.dists = dists;
    this.specsResults = specsResults;
    this.license = license;
    this.log = log;
    this.deprecated = deprecated || false;
  }

  getFileExtension(): string {
    switch (this.lang) {
      case DEFAULT_LANGUAGE:
      default:
        return 'js';
    }
  }

  _dependenciesAsWritableObject() {
    return R.mergeAll(this.dependencies.map(dependency => dependency.id.toObject()));
  }

  _getHomepage() {
    // TODO: Validate somehow that this scope is really on bitsrc (maybe check if it contains . ?)
    const homepage = this.scope
      ? `https://bitsrc.io/${this.scope.replace('.', '/')}/${this.box}/${this.name}`
      : undefined;
    return homepage;
  }

  static _dependenciesFromWritableObject(dependencies) {
    return BitIds.fromObject(dependencies).map(dependency => ({ id: dependency }));
  }

  writeBitJson(bitDir: string, force?: boolean = true): Promise<Component> {
    return new BitJson({
      version: this.version,
      scope: this.scope,
      lang: this.lang,
      bindingPrefix: this.bindingPrefix,
      compiler: this.compilerId ? this.compilerId.toString() : NO_PLUGIN_TYPE,
      tester: this.testerId ? this.testerId.toString() : NO_PLUGIN_TYPE,
      dependencies: this._dependenciesAsWritableObject(),
      packageDependencies: this.packageDependencies
    }).write({ bitDir, override: force });
  }

  getPackageNameAndPath(): Promise<any> {
    const packagePath = `${this.bindingPrefix}/${this.id.box}/${this.id.name}`;
    const packageName = this.id.toStringWithoutVersion();
    return { packageName, packagePath };
  }

  async writePackageJson(
    consumer: Consumer,
    bitDir: string,
    force?: boolean = true,
    writeBitDependencies?: boolean = false,
    excludeRegistryPrefix?: boolean = false
  ): Promise<boolean> {
    return packageJson.write(consumer, this, bitDir, force, writeBitDependencies, excludeRegistryPrefix);
  }

  dependencies(): BitIds {
    return BitIds.fromObject(this.dependencies);
  }

  flattenedDependencies(): BitIds {
    return BitIds.fromObject(this.flattenedDependencies);
  }

  /**
   * When dists are written by a consumer (as opposed to isolated-environment for example), the dist-entry and
   * dist-target are taken into account for calculating the path.
   * By default, the dists path is inside the component. If dist attribute is populated in bit.json, the path is
   * relative to consumer root.
   */
  getDistDirForConsumer(consumer: Consumer, componentRootDir: string): string {
    const consumerBitJson = consumer.bitJson;
    let rootDir = componentRootDir || '.';
    if (consumer.shouldDistsBeInsideTheComponent()) {
      // should be relative to component
      return path.join(consumer.getPath(), rootDir, DEFAULT_DIST_DIRNAME);
    }
    // should be relative to consumer root
    if (consumerBitJson.distEntry) rootDir = rootDir.replace(consumerBitJson.distEntry, '');
    const distTarget = consumerBitJson.distTarget || DEFAULT_DIST_DIRNAME;
    this._areDistsInsideComponentDir = false;
    return path.join(consumer.getPath(), distTarget, rootDir);
  }

  async buildIfNeeded({
    condition,
    files,
    compiler,
    consumer,
    componentMap,
    scope,
    verbose,
    directory,
    keep
  }: {
    condition?: ?boolean,
    files: File[],
    compiler: any,
    consumer?: Consumer,
    componentMap?: ComponentMap,
    scope: Scope,
    verbose: boolean,
    directory: ?string,
    keep: ?boolean
  }): Promise<?{ code: string, mappings?: string }> {
    if (!condition) {
      return Promise.resolve({ code: '' });
    }

    const runBuild = (componentRoot: string): Promise<any> => {
      const metaData = {
        entry: this.mainFile,
        files: this.files,
        root: componentRoot,
        packageDependencies: this.packageDependencies,
        dependencies: this.dependencies
      };

      if (compiler.build) {
        // @todo: is it still needed?
        return compiler.build(metaData); // returns a promise
      }

      // the compiler have one of the following (build/compile)
      let rootDistFolder = path.join(componentRoot, DEFAULT_DIST_DIRNAME);
      let sourceFiles = files;
      if (componentMap) {
        rootDistFolder = this.getDistDirForConsumer(consumer, componentMap.rootDir);
        if (consumer.bitJson.distEntry) {
          // when dist.entry is set, it should be removed from the calculated path of the dists files
          // the `sourceFiles` paths are used later on in the compiler code for the dists
          sourceFiles = files.map((file) => {
            const clonedFile = file.clone();
            const newRelative = file.relative.replace(consumer.bitJson.distEntry, '');
            clonedFile.path = path.join(file.base, newRelative);
            return clonedFile;
          });
        }
      }
      try {
        const result = compiler.compile(sourceFiles, rootDistFolder);
        return Promise.resolve(result);
      } catch (e) {
        if (verbose) return Promise.reject(new BuildException(this.id.toString(), e.stack));
        return Promise.reject(new BuildException(this.id.toString(), e.message));
      }
    };

    if (!compiler.build && !compiler.compile) {
      return Promise.reject(
        `"${this.compilerId.toString()}" does not have a valid compiler interface, it has to expose a build method`
      );
    }

    if (consumer) return runBuild(consumer.getPath());
    if (this.isolatedEnvironment) return runBuild(this.writtenPath);

    const isolatedEnvironment = new IsolatedEnvironment(scope, directory);
    try {
      await isolatedEnvironment.create();
      const isolateOpts = {
        verbose,
        installPackages: true,
        noPackageJson: false
      };
      const componetWithDependencies = await isolatedEnvironment.isolateComponent(this.id.toString(), isolateOpts);
      const component = componetWithDependencies.component;
      const result = await runBuild(component.writtenPath);
      if (!keep) await isolatedEnvironment.destroy();
      return result;
    } catch (err) {
      await isolatedEnvironment.destroy();
      return Promise.reject(err);
    }
  }

  async _writeToComponentDir({
    bitDir,
    withBitJson,
    withPackageJson,
    consumer,
    force = true,
    writeBitDependencies = false,
    deleteBitDirContent = false,
    excludeRegistryPrefix = false
  }: {
    bitDir: string,
    withBitJson: boolean,
    withPackageJson: boolean,
    consumer: Consumer,
    force?: boolean,
    writeBitDependencies?: boolean,
    deleteBitDirContent?: boolean,
    excludeRegistryPrefix?: boolean
  }) {
    if (deleteBitDirContent) {
      fs.emptydirSync(bitDir);
    } else {
      await mkdirp(bitDir);
    }
    if (this.files) await this.files.forEach(file => file.write(undefined, force));
    if (this.dists && this._writeDistsFiles) await this.dists.forEach(dist => dist.write(undefined, force));
    if (withBitJson) await this.writeBitJson(bitDir, force);
    if (withPackageJson) {
      await this.writePackageJson(consumer, bitDir, force, writeBitDependencies, excludeRegistryPrefix);
    }
    if (this.license && this.license.src) await this.license.write(bitDir, force);
    logger.debug('component has been written successfully');
    return this;
  }

  getComponentMap(bitMap: BitMap): ComponentMap {
    return bitMap.getComponent(this.id);
  }

  _addComponentToBitMap(bitMap: BitMap, rootDir: string, origin: string, parent?: string): ComponentMap {
    const filesForBitMap = this.files.map((file) => {
      return { name: file.basename, relativePath: pathNormalizeToLinux(file.relative), test: file.test };
    });

    return bitMap.addComponent({
      componentId: this.id,
      files: filesForBitMap,
      mainFile: this.mainFile,
      rootDir,
      origin,
      parent,
      originallySharedDir: this.originallySharedDir
    });
  }

  /**
   * Before writing the files into the file-system, remove the path-prefix that is shared among the main component files
   * and its dependencies. It helps to avoid large file-system paths.
   *
   * This is relevant for IMPORTED components only as the author may have long paths that are not needed for whoever
   * imports it. NESTED and AUTHORED components are written as is.
   */
  stripOriginallySharedDir(bitMap: BitMap): void {
    if (this._wasOriginallySharedDirStripped) return;
    this.setOriginallySharedDir();
    const originallySharedDir = this.originallySharedDir;
    const pathWithoutSharedDir = (pathStr, sharedDir, isLinuxFormat) => {
      if (!sharedDir) return pathStr;
      const partToRemove = isLinuxFormat ? `${sharedDir}/` : path.normalize(sharedDir) + path.sep;
      return pathStr.replace(partToRemove, '');
    };
    this.files.forEach((file) => {
      const newRelative = pathWithoutSharedDir(file.relative, originallySharedDir, false);
      file.updatePaths({ newBase: file.base, newRelative });
    });
    if (this.dists) {
      this.dists.forEach((distFile) => {
        const newRelative = pathWithoutSharedDir(distFile.relative, originallySharedDir, false);
        distFile.updatePaths({ newBase: distFile.base, newRelative });
      });
    }
    this.mainFile = pathWithoutSharedDir(this.mainFile, originallySharedDir, true);
    this.dependencies.forEach((dependency) => {
      const dependencyId = dependency.id.toString();
      const depFromBitMap = bitMap.getComponent(dependencyId);
      dependency.relativePaths.forEach((relativePath: RelativePath) => {
        relativePath.sourceRelativePath = pathWithoutSharedDir(
          relativePath.sourceRelativePath,
          originallySharedDir,
          true
        );
        if (depFromBitMap && depFromBitMap.origin === COMPONENT_ORIGINS.IMPORTED) {
          relativePath.destinationRelativePath = pathWithoutSharedDir(
            relativePath.destinationRelativePath,
            depFromBitMap.originallySharedDir,
            true
          );
        }
      });
    });
    this._wasOriginallySharedDirStripped = true;
  }

  updateDistsPerConsumerBitJson(consumer: Consumer, componentMap: ComponentMap): void {
    if (this.dists) {
      const newDistBase = this.getDistDirForConsumer(consumer, componentMap.rootDir);
      const getNewRelative = (dist) => {
        if (consumer.bitJson.distEntry) {
          return dist.relative.replace(consumer.bitJson.distEntry, '');
        }
      };
      this.dists.forEach(dist => dist.updatePaths({ newBase: newDistBase, newRelative: getNewRelative(dist) }));
    }
  }

  /**
   * When using this function please check if you really need to pass the bitDir or not
   * It's better to init the files with the correct base, cwd and path than pass it here
   * It's mainly here for cases when we write from the model so this is the first point we actually have the dir
   */
  async write({
    bitDir,
    withBitJson = true,
    withPackageJson = true,
    force = true,
    bitMap,
    origin,
    parent,
    consumer,
    writeBitDependencies = false,
    componentMap,
    excludeRegistryPrefix = false
  }: {
    bitDir?: string,
    withBitJson?: boolean,
    withPackageJson?: boolean,
    force?: boolean,
    bitMap?: BitMap,
    origin?: string,
    parent?: BitId,
    consumer?: Consumer,
    writeBitDependencies?: boolean,
    componentMap: ComponentMap,
    excludeRegistryPrefix?: boolean
  }): Promise<Component> {
    logger.debug(`consumer-component.write, id: ${this.id.toString()}`);
    const consumerPath: ?string = consumer ? consumer.getPath() : undefined;
    if (!this.files) throw new Error(`Component ${this.id.toString()} is invalid as it has no files`);
    // Take the bitdir from the files (it will be the same for all the files of course)
    const calculatedBitDir = bitDir || this.files[0].base;
    // Update files base dir according to bitDir
    if (this.files && bitDir) this.files.forEach(file => file.updatePaths({ newBase: bitDir }));
    if (this.dists && bitDir) this.dists.forEach(dist => dist.updatePaths({ newBase: bitDir }));

    // if bitMap parameter is empty, for instance, when it came from the scope, ignore bitMap altogether.
    // otherwise, check whether this component is in bitMap:
    // if it's there, write the files according to the paths in bit.map.
    // Otherwise, write to bitDir and update bitMap with the new paths.
    if (!bitMap) {
      return this._writeToComponentDir({
        bitDir: calculatedBitDir,
        withBitJson,
        withPackageJson,
        consumer,
        force,
        writeBitDependencies,
        excludeRegistryPrefix
      });
    }
    if (!componentMap) {
      // if there is no componentMap, the component is new to this project and should be written to bit.map
      componentMap = this._addComponentToBitMap(bitMap, calculatedBitDir, origin, parent);
    }
    if (!consumer.shouldDistsBeInsideTheComponent() && !this.dists) {
      // since the dists are set to be outside the components dir, the source files must be saved there
      // otherwise, other components in dists won't be able to link to this component
      this.copyFilesIntoDists();
    }
    // For IMPORTED component we have to delete the content of the directory before importing.
    // Otherwise, when the author adds new files outside of the previous originallySharedDir and this user imports them
    // the environment will contain both copies, the old one with the old originallySharedDir and the new one.
    // If a user made changes to the imported component, it will show a warning and stop the process.
    const deleteBitDirContent = origin === COMPONENT_ORIGINS.IMPORTED;
    // when there is componentMap, this component (with this version or other version) is already part of the project.
    // There are several options as to what was the origin before and what is the origin now and according to this,
    // we update/remove/don't-touch the record in bit.map.
    // The current origin can't be AUTHORED because when the author creates a component for the first time,
    // 1) current origin is AUTHORED - If the version is the same as before, don't update bit.map. Otherwise, update.
    // 2) current origin is IMPORTED - If the version is the same as before, don't update bit.map. Otherwise, update.
    // one exception is where the origin was NESTED before, in this case, remove the current record and add a new one.
    // 3) current origin is NESTED - the version can't be the same as before (otherwise it would be ignored before and
    // never reach this function, see @writeToComponentsDir). Therefore, always add to bit.map.
    if (origin === COMPONENT_ORIGINS.IMPORTED && componentMap.origin === COMPONENT_ORIGINS.NESTED) {
      // when a user imports a component that was a dependency before, write the component directly into the components
      // directory for an easy access/change. Then, remove the current record from bit.map and add an updated one.
      const oldLocation = path.join(consumerPath, componentMap.rootDir);
      logger.debug(
        `deleting the old directory of a component at ${oldLocation}, the new directory is ${calculatedBitDir}`
      );
      fs.removeSync(oldLocation);
      bitMap.removeComponent(this.id.toString());
      componentMap = this._addComponentToBitMap(bitMap, calculatedBitDir, origin, parent);
    }
    logger.debug('component is in bit.map, write the files according to bit.map');
    this.updateDistsPerConsumerBitJson(consumer, componentMap);
    const newBase = componentMap.rootDir ? path.join(consumerPath, componentMap.rootDir) : consumerPath;
    this.writtenPath = newBase;
    this.files.forEach(file => file.updatePaths({ newBase }));
    // Don't write the package.json for an authored component, because it's dependencies probably managed
    // By the root package.json
    const actualWithPackageJson = withPackageJson && origin !== COMPONENT_ORIGINS.AUTHORED;
    await this._writeToComponentDir({
      bitDir: newBase,
      withBitJson,
      withPackageJson: actualWithPackageJson,
      consumer,
      force,
      writeBitDependencies,
      deleteBitDirContent,
      excludeRegistryPrefix
    });

    if (bitMap.isExistWithSameVersion(this.id)) return this; // no need to update bit.map
    this._addComponentToBitMap(bitMap, componentMap.rootDir, origin, parent);
    return this;
  }

  async writeDists(consumer?: Consumer, bitMap?: BitMap, writeLinks?: boolean = true): Promise<?(string[])> {
    if (!this.dists) return null;
    let componentMap;
    if (consumer && bitMap) {
      componentMap = bitMap.getComponent(this.id);
      this.updateDistsPerConsumerBitJson(consumer, componentMap);
    }
    const saveDist = this.dists.map(distFile => distFile.write());
    if (writeLinks && componentMap && componentMap.origin === COMPONENT_ORIGINS.IMPORTED) {
      await writeLinksInDist(this, componentMap, bitMap, consumer);
    }
    return Promise.all(saveDist);
  }

  async runSpecs({
    scope,
    rejectOnFailure,
    consumer,
    environment,
    save,
    bitMap,
    verbose,
    isolated,
    directory,
    keep,
    isCI = false
  }: {
    scope: Scope,
    rejectOnFailure?: boolean,
    consumer?: Consumer,
    environment?: boolean,
    save?: boolean,
    bitMap?: BitMap,
    verbose?: boolean,
    isolated?: boolean,
    directory?: string,
    keep?: boolean,
    isCI?: boolean
  }): Promise<?Results> {
    // TODO: The same function exactly exists in this file under build function
    // Should merge them to one
    const installEnvironmentsIfNeeded = (): Promise<any> => {
      if (environment) {
        loader.start(BEFORE_IMPORT_ENVIRONMENT);
        return scope.installEnvironment({
          ids: [this.compilerId, this.testerId],
          verbose
        });
      }

      return Promise.resolve();
    };

    const testFiles = this.files.filter(file => file.test);
    if (!this.testerId || !testFiles || R.isEmpty(testFiles)) return null;

    let testerFilePath;
    try {
      testerFilePath = await scope.loadEnvironment(this.testerId, { pathOnly: true });
    } catch (err) {
      if (err instanceof ResolutionException) {
        logger.debug(`Unable to find tester ${this.testerId}, will try to import it`);
        environment = true;
        // todo: once we agree about this approach, get rid of the environment variable
      } else throw err;
    }

    await installEnvironmentsIfNeeded();
    logger.debug('Environment components are installed.');
    try {
      if (!testerFilePath) {
        testerFilePath = await scope.loadEnvironment(this.testerId, { pathOnly: true });
      }

      const run = async (mainFile: string, distTestFiles: Dist[]) => {
        loader.start(BEFORE_RUNNING_SPECS);
        try {
          const specsResultsP = distTestFiles.map(async (testFile) => {
            return specsRunner.run({
              scope,
              testerFilePath,
              testerId: this.testerId,
              mainFile,
              testFilePath: testFile.path
            });
          });
          const specsResults = await Promise.all(specsResultsP);
          this.specsResults = specsResults.map(specRes => SpecsResults.createFromRaw(specRes));
          if (rejectOnFailure && !this.specsResults.every(element => element.pass)) {
            return Promise.reject(new ComponentSpecsFailed());
          }

          if (save) {
            await scope.sources.modifySpecsResults({
              source: this,
              specsResults: this.specsResults
            });
            return this.specsResults;
          }

          return this.specsResults;
        } catch (err) {
          // Put this condition in comment for now because we want to catch exceptions in the testers
          // We can just pass the rejectOnFailure=true in the consumer.runComponentSpecs
          // Because this will also affect the condition few lines above:
          // if (rejectOnFailure && !this.specsResults.every(element => element.pass)) {
          // in general there is some coupling with the test running between the params:
          // rejectOnFailure / verbose and the initiator of the running (scope / consumer)
          // We should make a better architecture for this

          // if (rejectOnFailure) {
          if (verbose) throw err;
          throw new ComponentSpecsFailed();
          // }
          // return this.specsResults;
        }
      };

      if (!isolated && consumer) {
        logger.debug('Building the component before running the tests');
        await this.build({ scope, environment, bitMap, verbose, consumer });
        await this.writeDists(consumer, bitMap);
        const testDists = this.dists ? this.dists.filter(dist => dist.test) : this.files.filter(file => file.test);
        return run(this.mainFile, testDists);
      }

      const isolatedEnvironment = new IsolatedEnvironment(scope, directory);
      try {
        await isolatedEnvironment.create();
        const isolateOpts = {
          verbose,
          dist: true,
          installPackages: true,
          noPackageJson: false
        };
        const componentWithDependencies = await isolatedEnvironment.isolateComponent(this.id.toString(), isolateOpts);
        const component = componentWithDependencies.component;
        component.isolatedEnvironment = isolatedEnvironment;
        logger.debug(`the component ${this.id.toString()} has been imported successfully into an isolated environment`);

        await component.build({ scope, environment, verbose });
        if (component.dists) {
          const specDistWrite = component.dists.map(file => file.write());
          await Promise.all(specDistWrite);
        }
        const testFilesList = component.dists
          ? component.dists.filter(dist => dist.test)
          : component.files.filter(file => file.test);
        const results = await run(component.mainFile, testFilesList);
        if (!keep) await isolatedEnvironment.destroy();
        return isCI ? { specResults: results, mainFile: this.calculateMainDistFile() } : results;
      } catch (e) {
        await isolatedEnvironment.destroy();
        return Promise.reject(e);
      }
    } catch (err) {
      return Promise.reject(err);
    }
  }

  copyFilesIntoDists() {
    this.dists = this.files.map(file => new Dist({ base: file.base, path: file.path, contents: file.contents }));
  }

  async build({
    scope,
    environment,
    save,
    consumer,
    bitMap,
    verbose,
    directory,
    keep,
    isCI = false
  }: {
    scope: Scope,
    environment?: boolean,
    save?: boolean,
    consumer?: Consumer,
    bitMap?: BitMap,
    verbose?: boolean,
    directory: ?string,
    keep: ?boolean,
    isCI: ?boolean
  }): Promise<string> {
    logger.debug(`consumer-component.build ${this.id}`);
    // @TODO - write SourceMap Type
    if (!this.compilerId) {
      if (!consumer || consumer.shouldDistsBeInsideTheComponent()) {
        logger.debug('compilerId was not found, nothing to build');
        return Promise.resolve(null);
      }
      logger.debug(
        'compilerId was not found, however, because the dists are set to be outside the components directory, save the source file as dists'
      );
      this.copyFilesIntoDists();
      return this.dists;
    }
    // Ideally it's better to use the dists from the model.
    // If there is no consumer, it comes from the scope or isolated environment, which the dists are already saved.
    // If there is consumer, check whether the component was modified. If it wasn't, no need to re-build.
    const isNeededToReBuild = async () => {
      if (!consumer) return false;
      const componentStatus = await consumer.getComponentStatusById(this.id);
      return componentStatus.modified;
    };

    if (!bitMap && consumer) {
      bitMap = await consumer.getBitMap();
    }
    const componentMap = bitMap && bitMap.getComponent(this.id.toString());

    const needToRebuild = await isNeededToReBuild();
    if (!needToRebuild && this.dists) {
      logger.debug('skip the build process as the component was not modified, use the dists saved in the model');
      if (componentMap && componentMap.origin === COMPONENT_ORIGINS.IMPORTED) {
        this.stripOriginallySharedDir(bitMap);
        // don't worry about the dist.entry and dist.target at this point. It'll be done later on once the files are
        // written, probably by this.writeDists()
      }

      return isCI ? { mainFile: this.calculateMainDistFile(), dists: this.dists } : this.dist;
    }

    logger.debug('compilerId found, start building');
    // verify whether the environment is installed
    let compiler;
    try {
      compiler = await scope.loadEnvironment(this.compilerId);
    } catch (err) {
      if (err instanceof ResolutionException) {
        environment = true;
        // todo: once we agree about this approach, get rid of the environment variable
      } else {
        return Promise.reject(err);
      }
    }

    const installEnvironmentIfNeeded = async (): Promise<any> => {
      if (environment) {
        loader.start(BEFORE_IMPORT_ENVIRONMENT);
        return scope.installEnvironment({
          ids: [this.compilerId],
          verbose
        });
      }

      return Promise.resolve();
    };

    await installEnvironmentIfNeeded();

    if (!compiler) {
      compiler = await scope.loadEnvironment(this.compilerId);
    }
    const builtFiles = await this.buildIfNeeded({
      condition: !!this.compilerId,
      compiler,
      files: this.files,
      consumer,
      componentMap,
      scope,
      directory,
      keep,
      verbose
    });

    // return buildFilesP.then((buildedFiles) => {
    builtFiles.forEach((file) => {
      if (file && (!file.contents || !isString(file.contents.toString()))) {
        throw new Error('builder interface has to return object with a code attribute that contains string');
      }
    });

    this.dists = builtFiles.map(file => new Dist(file));

    if (save) {
      await scope.sources.updateDist({ source: this });
    }

    return this.dists;
  }

  async isolate(scope: Scope, opts: IsolateOptions): Promise<string> {
    const isolatedEnvironment = new IsolatedEnvironment(scope, opts.writeToPath);
    try {
      await isolatedEnvironment.create();
      await isolatedEnvironment.isolateComponent(this.id.toString(), opts);
      return isolatedEnvironment.path;
    } catch (err) {
      await isolatedEnvironment.destroy();
      throw new Error(err);
    }
  }

  toObject(): Object {
    return {
      name: this.name,
      box: this.box,
      version: this.version,
      mainFile: this.mainFile,
      scope: this.scope,
      lang: this.lang,
      bindingPrefix: this.bindingPrefix,
      compilerId: this.compilerId ? this.compilerId.toString() : null,
      testerId: this.testerId ? this.testerId.toString() : null,
      dependencies: this.dependencies.map(dep => Object.assign({}, dep, { id: dep.id.toString() })), // this._dependenciesAsWritableObject(),
      packageDependencies: this.packageDependencies,
      files: this.files,
      docs: this.docs,
      dists: this.dists,
      specsResults: this.specsResults ? this.specsResults.map(res => res.serialize()) : null,
      license: this.license ? this.license.serialize() : null,
      log: this.log,
      deprecated: this.deprecated
    };
  }

  toString(): string {
    return JSON.stringify(this.toObject());
  }

  // In case there are dist files, we want to point the index to the main dist file, not to source.
  // This important since when you require a module without specify file, it will give you the file specified under this key
  // (or index.js if key not exists)
  calculateMainDistFile(): string {
    if (this._writeDistsFiles && this._areDistsInsideComponentDir) {
      const mainFile = searchFilesIgnoreExt(this.dists, path.normalize(this.mainFile), 'relative', 'relative');
      if (mainFile) return path.join(DEFAULT_DIST_DIRNAME, mainFile);
    }
    return this.mainFile;
  }

  /**
   * find a shared directory among the files of the main component and its dependencies
   */
  setOriginallySharedDir() {
    if (this.originallySharedDir !== undefined) return;
    // taken from https://stackoverflow.com/questions/1916218/find-the-longest-common-starting-substring-in-a-set-of-strings
    // It sorts the array, and then looks just at the first and last items
    const sharedStartOfArray = (array) => {
      const sortedArray = array.concat().sort();
      const firstItem = sortedArray[0];
      const lastItem = sortedArray[sortedArray.length - 1];
      let i = 0;
      while (i < firstItem.length && firstItem.charAt(i) === lastItem.charAt(i)) i++;
      return firstItem.substring(0, i);
    };
    const pathSep = '/'; // it works for Windows as well as all paths are normalized to Linux
    const filePaths = this.files.map(file => pathNormalizeToLinux(file.relative));
    const dependenciesPaths = this.dependencies.map(dependency =>
      dependency.relativePaths.map(relativePath => relativePath.sourceRelativePath)
    );
    const allPaths = [...filePaths, ...R.flatten(dependenciesPaths)];
    const sharedStart = sharedStartOfArray(allPaths);
    if (!sharedStart || !sharedStart.includes(pathSep)) return;
    const lastPathSeparator = sharedStart.lastIndexOf(pathSep);
    this.originallySharedDir = sharedStart.substring(0, lastPathSeparator);
  }

  async toComponentWithDependencies(bitMap: BitMap, consumer: Consumer): Promise<ComponentWithDependencies> {
    const getDependencies = () => {
      return this.dependencies.map((dependency) => {
        if (bitMap.isExistWithSameVersion(dependency.id)) {
          return consumer.loadComponent(dependency.id);
        }
        // when dependencies are imported as npm packages, they are not in bit.map
        this.dependenciesSavedAsComponents = false;
        return consumer.scope.loadComponent(dependency.id, false);
      });
    };
    const dependencies = await Promise.all(getDependencies());
    return new ComponentWithDependencies({ component: this, dependencies });
  }

  static fromObject(object: Object): Component {
    const {
      name,
      box,
      version,
      scope,
      lang,
      bindingPrefix,
      compilerId,
      testerId,
      dependencies,
      packageDependencies,
      docs,
      mainFile,
      dists,
      files,
      specsResults,
      license,
      deprecated
    } = object;
    return new Component({
      name,
      box,
      version,
      scope,
      lang,
      bindingPrefix,
      compilerId: compilerId ? BitId.parse(compilerId) : null,
      testerId: testerId ? BitId.parse(testerId) : null,
      dependencies: dependencies.map(dep => Object.assign({}, dep, { id: BitId.parse(dep.id) })), // this._dependenciesFromWritableObject(dependencies),
      packageDependencies,
      mainFile,
      files,
      docs,
      dists,
      specsResults: specsResults ? SpecsResults.deserialize(specsResults) : null,
      license: license ? License.deserialize(license) : null,
      deprecated: deprecated || false
    });
  }

  static fromString(str: string): Component {
    const object = JSON.parse(str);
    object.files = SourceFile.loadFromParsedStringArray(object.files);
    object.dists = Dist.loadFromParsedStringArray(object.dists);
    return this.fromObject(object);
  }

  static loadFromFileSystem({
    bitDir,
    consumerBitJson,
    componentMap,
    id,
    consumerPath,
    bitMap,
    componentFromModel
  }: {
    bitDir: string,
    consumerBitJson: ConsumerBitJson,
    componentMap: ComponentMap,
    id: BitId,
    consumerPath: string,
    bitMap: BitMap,
    componentFromModel: ModelComponent
  }): Component {
    const deprecated = componentFromModel ? componentFromModel.component.deprecated : false;
    let dists = componentFromModel ? componentFromModel.component.dists : undefined;
    let packageDependencies;
    let bitJson = consumerBitJson;
    const getLoadedFiles = (files: ComponentMapFile[]): SourceFile[] => {
      const sourceFiles = [];
      const filesKeysToDelete = [];
      files.forEach((file, key) => {
        const filePath = path.join(bitDir, file.relativePath);
        try {
          const sourceFile = SourceFile.load(filePath, consumerBitJson.distTarget, bitDir, consumerPath, {
            test: file.test
          });
          sourceFiles.push(sourceFile);
        } catch (err) {
          if (!(err instanceof FileSourceNotFound)) throw err;
          logger.warn(`a file ${filePath} will be deleted from bit.map as it does not exist on the file system`);
          filesKeysToDelete.push(key);
        }
      });
      if (filesKeysToDelete.length && !sourceFiles.length) {
        throw new MissingFilesFromComponent(id.toString());
      }
      if (filesKeysToDelete.length) {
        filesKeysToDelete.forEach(key => files.splice(key, 1));
        bitMap.hasChanged = true;
      }

      return sourceFiles;
    };
    if (!fs.existsSync(bitDir)) return Promise.reject(new ComponentNotFoundInPath(bitDir));
    const files = componentMap.files;
    // Load the base entry from the root dir in map file in case it was imported using -path
    // Or created using bit create so we don't want all the path but only the relative one
    // Check that bitDir isn't the same as consumer path to make sure we are not loading global stuff into component
    // (like dependencies)
    if (bitDir !== consumerPath) {
      bitJson = BitJson.loadSync(bitDir, consumerBitJson);
      if (bitJson) {
        packageDependencies = bitJson.packageDependencies;
      }
    }

    // by default, imported components are not written with bit.json file.
    // use the component from the model to get their bit.json values
    if (!fs.existsSync(path.join(bitDir, BIT_JSON)) && componentFromModel) {
      bitJson.mergeWithComponentData(componentFromModel.component);
    }

    // Remove dists if compiler has been deleted
    if (dists && !bitJson.compilerId) {
      dists = undefined;
    }

    return new Component({
      name: id.name,
      box: id.box,
      scope: id.scope,
      version: id.version,
      lang: bitJson.lang,
      bindingPrefix: bitJson.bindingPrefix || DEFAULT_BINDINGS_PREFIX,
      compilerId: BitId.parse(bitJson.compilerId),
      testerId: BitId.parse(bitJson.testerId),
      mainFile: componentMap.mainFile,
      files: getLoadedFiles(files),
      dists,
      packageDependencies,
      deprecated
    });
  }

  static create(
    {
      scopeName,
      name,
      box,
      withSpecs,
      files,
      mainFile,
      consumerBitJson,
      bitPath,
      consumerPath
    }: {
      consumerBitJson: ConsumerBitJson,
      name: string,
      mainFile: string,
      box: string,
      scopeName?: ?string,
      withSpecs?: ?boolean
    },
    scope: Scope
  ): Component {
    const specsFile = consumerBitJson.getSpecBasename();
    const compilerId = BitId.parse(consumerBitJson.compilerId);
    const testerId = BitId.parse(consumerBitJson.testerId);
    const lang = consumerBitJson.lang;
    const bindingPrefix = consumerBitJson.bindingPrefix;
    const implVinylFile = new SourceFile({
      cwd: consumerPath,
      base: path.join(consumerPath, bitPath),
      path: path.join(consumerPath, bitPath, files['impl.js']),
      contents: new Buffer(Impl.create(name, compilerId, scope).src)
    });
    implVinylFile.test = false;

    return new Component({
      name,
      box,
      lang,
      bindingPrefix,
      version: LATEST_BIT_VERSION,
      scope: scopeName,
      specsFile,
      files: [implVinylFile],
      mainFile,
      compilerId,
      testerId,
      specs: withSpecs ? Specs.create(name, testerId, scope) : undefined
    });
  }
}
