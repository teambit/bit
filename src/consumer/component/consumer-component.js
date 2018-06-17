// @flow
import path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import c from 'chalk';
import { mkdirp, isString, pathNormalizeToLinux, createSymlinkOrCopy } from '../../utils';
import ComponentBitJson from '../bit-json';
import { Dist, License, SourceFile } from '../component/sources';
import ConsumerBitJson from '../bit-json/consumer-bit-json';
import Consumer from '../consumer';
import BitId from '../../bit-id/bit-id';
import Scope from '../../scope/scope';
import BitIds from '../../bit-id/bit-ids';
import docsParser, { Doclet } from '../../jsdoc/parser';
import specsRunner from '../../specs-runner';
import SpecsResults from '../specs-results';
import ComponentSpecsFailed from '../exceptions/component-specs-failed';
import MissingFilesFromComponent from './exceptions/missing-files-from-component';
import ComponentNotFoundInPath from './exceptions/component-not-found-in-path';
import IsolatedEnvironment, { IsolateOptions } from '../../environment';
import type { Log } from '../../scope/models/version';
import BitMap from '../bit-map';
import ComponentMap from '../bit-map/component-map';
import logger from '../../logger/logger';
import loader from '../../cli/loader';
import CompilerExtension from '../../extensions/compiler-extension';
import TesterExtension from '../../extensions/tester-extension';
import { Driver } from '../../driver';
import { BEFORE_IMPORT_ENVIRONMENT, BEFORE_RUNNING_SPECS } from '../../cli/loader/loader-messages';
import FileSourceNotFound from './exceptions/file-source-not-found';
import {
  DEFAULT_BOX_NAME,
  DEFAULT_LANGUAGE,
  DEFAULT_BINDINGS_PREFIX,
  COMPONENT_ORIGINS,
  DEFAULT_DIST_DIRNAME
} from '../../constants';
import ComponentWithDependencies from '../../scope/component-dependencies';
import * as packageJson from './package-json';
import { Dependency, Dependencies } from './dependencies';
import Dists from './sources/dists';
import type { PathLinux, PathOsBased } from '../../utils/path';
import type { RawTestsResults } from '../specs-results/specs-results';
import { paintSpecsResults } from '../../cli/chalk-box';
import ExternalTestError from './exceptions/external-test-error';
import ExternalBuildError from './exceptions/external-build-error';
import InvalidCompilerInterface from './exceptions/invalid-compiler-interface';
import GeneralError from '../../error/general-error';
import AbstractBitJson from '../bit-json/abstract-bit-json';
import { Analytics } from '../../analytics/analytics';
import ConsumerComponent from '.';
import type { PackageJsonInstance } from './package-json';

export type customResolvedPath = { destinationPath: PathLinux, importSource: string };

export type ComponentProps = {
  name: string,
  box: string,
  version?: ?string,
  scope?: ?string,
  lang?: string,
  bindingPrefix?: string,
  mainFile: PathOsBased,
  compiler?: CompilerExtension,
  tester: TesterExtension,
  bitJson?: ComponentBitJson,
  dependencies?: Dependency[],
  devDependencies?: Dependency[],
  flattenedDependencies?: ?BitIds,
  flattenedDevDependencies?: ?BitIds,
  packageDependencies?: ?Object,
  devPackageDependencies?: ?Object,
  peerPackageDependencies?: ?Object,
  envsPackageDependencies?: ?Object,
  customResolvedPaths?: ?(customResolvedPath[]),
  files: SourceFile[],
  docs?: ?(Doclet[]),
  dists?: Dist[],
  specsResults?: ?SpecsResults,
  license?: ?License,
  deprecated: ?boolean,
  log?: ?Log
};

export default class Component {
  name: string;
  box: string;
  version: ?string;
  scope: ?string;
  lang: string;
  bindingPrefix: string;
  mainFile: PathOsBased;
  compiler: ?CompilerExtension;
  tester: ?TesterExtension;
  bitJson: ?ComponentBitJson;
  dependencies: Dependencies;
  devDependencies: Dependencies;
  flattenedDevDependencies: BitIds;
  flattenedDependencies: BitIds;
  packageDependencies: Object;
  devPackageDependencies: Object;
  peerPackageDependencies: Object;
  envsPackageDependencies: Object;
  _docs: ?(Doclet[]);
  _files: SourceFile[];
  dists: Dists;
  specsResults: ?(SpecsResults[]);
  license: ?License;
  log: ?Log;
  writtenPath: ?string; // needed for generate links
  dependenciesSavedAsComponents: ?boolean = true; // otherwise they're saved as npm packages
  originallySharedDir: ?PathLinux; // needed to reduce a potentially long path that was used by the author
  _wasOriginallySharedDirStripped: ?boolean; // whether stripOriginallySharedDir() method had been called, we don't want to strip it twice
  loadedFromFileSystem: boolean = false; // whether a component was loaded from the filesystem or converted from the model
  componentMap: ?ComponentMap; // always populated when the loadedFromFileSystem is true
  componentFromModel: ?Component; // populated when loadedFromFileSystem is true and it exists in the model
  isolatedEnvironment: IsolatedEnvironment;
  missingDependencies: ?Object;
  deprecated: boolean;
  customResolvedPaths: customResolvedPath[];
  _driver: Driver;
  _isModified: boolean;
  packageJsonInstance: PackageJsonInstance;

  set files(val: SourceFile[]) {
    this._files = val;
  }

  get files(): SourceFile[] {
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
    compiler,
    tester,
    bitJson,
    dependencies,
    devDependencies,
    flattenedDependencies,
    flattenedDevDependencies,
    packageDependencies,
    devPackageDependencies,
    peerPackageDependencies,
    envsPackageDependencies,
    files,
    docs,
    dists,
    specsResults,
    license,
    log,
    deprecated,
    customResolvedPaths
  }: ComponentProps) {
    this.name = name;
    this.box = box || DEFAULT_BOX_NAME;
    this.version = version;
    this.scope = scope;
    this.lang = lang || DEFAULT_LANGUAGE;
    this.bindingPrefix = bindingPrefix || DEFAULT_BINDINGS_PREFIX;
    this.mainFile = path.normalize(mainFile);
    this.compiler = compiler;
    this.tester = tester;
    this.bitJson = bitJson;
    this.setDependencies(dependencies);
    this.setDevDependencies(devDependencies);
    this.flattenedDependencies = flattenedDependencies || new BitIds();
    this.flattenedDevDependencies = flattenedDevDependencies || new BitIds();
    this.packageDependencies = packageDependencies || {};
    this.devPackageDependencies = devPackageDependencies || {};
    this.peerPackageDependencies = peerPackageDependencies || {};
    this.envsPackageDependencies = envsPackageDependencies || {};
    this._files = files;
    this._docs = docs;
    this.setDists(dists);
    this.specsResults = specsResults;
    this.license = license;
    this.log = log;
    this.deprecated = deprecated || false;
    this.customResolvedPaths = customResolvedPaths || [];
    this.validateComponent();
  }

  validateComponent() {
    const nonEmptyFields = ['name', 'box', 'mainFile'];
    nonEmptyFields.forEach((field) => {
      if (!this[field]) {
        throw new GeneralError(`failed loading a component ${this.id}, the field "${field}" can't be empty`);
      }
    });
  }

  setDependencies(dependencies?: Dependency[]) {
    this.dependencies = new Dependencies(dependencies);
  }

  setDevDependencies(devDependencies?: Dependency[]) {
    this.devDependencies = new Dependencies(devDependencies);
  }

  setDists(dists?: Dist[]) {
    this.dists = new Dists(dists);
  }

  getFileExtension(): string {
    switch (this.lang) {
      case DEFAULT_LANGUAGE:
      default:
        return 'js';
    }
  }

  _getHomepage() {
    // TODO: Validate somehow that this scope is really on bitsrc (maybe check if it contains . ?)
    const homepage = this.scope
      ? `https://bitsrc.io/${this.scope.replace('.', '/')}/${this.box}/${this.name}`
      : undefined;
    return homepage;
  }

  async writeConfig(bitDir: string, ejectedEnvsDirectory: string, override?: boolean = true): Promise<void> {
    const ejectedCompilerDirectoryP = this.compiler
      ? await this.compiler.writeFilesToFs({ bitDir, ejectedEnvsDirectory })
      : '';
    const ejectedTesterDirectoryP = this.tester
      ? await this.tester.writeFilesToFs({ bitDir, ejectedEnvsDirectory })
      : '';
    const [ejectedCompilerDirectory, ejectedTesterDirectory] = await Promise.all([
      ejectedCompilerDirectoryP,
      ejectedTesterDirectoryP
    ]);
    return this.writeBitJson(bitDir, ejectedCompilerDirectory, ejectedTesterDirectory, override);
  }

  writeBitJson(
    bitDir: string,
    ejectedCompilerDirectory: string,
    ejectedTesterDirectory: string,
    override?: boolean = true
  ): Promise<ComponentBitJson> {
    return new ComponentBitJson({
      version: this.version,
      scope: this.scope,
      lang: this.lang,
      bindingPrefix: this.bindingPrefix,
      compiler: this.compiler ? this.compiler.toBitJsonObject(ejectedCompilerDirectory) : {},
      tester: this.tester ? this.tester.toBitJsonObject(ejectedTesterDirectory) : {},
      dependencies: this.dependencies.asWritableObject(),
      devDependencies: this.devDependencies.asWritableObject(),
      packageDependencies: this.packageDependencies,
      devPackageDependencies: this.devPackageDependencies,
      peerPackageDependencies: this.peerPackageDependencies
    }).write({ bitDir, override });
  }

  getPackageNameAndPath(): Promise<any> {
    const packagePath = `${this.bindingPrefix}/${this.id.box}/${this.id.name}`;
    const packageName = this.id.toStringWithoutVersion();
    return { packageName, packagePath };
  }

  async writePackageJson(
    consumer: Consumer,
    bitDir: string,
    override?: boolean = true,
    writeBitDependencies?: boolean = false,
    excludeRegistryPrefix?: boolean = false
  ): Promise<boolean> {
    const packageJsonInstance = await packageJson.write(
      consumer,
      this,
      bitDir,
      override,
      writeBitDependencies,
      excludeRegistryPrefix
    );
    this.packageJsonInstance = packageJsonInstance;
  }

  flattenedDependencies(): BitIds {
    return BitIds.fromObject(this.flattenedDependencies);
  }

  flattenedDevDependencies(): BitIds {
    return BitIds.fromObject(this.flattenedDevDependencies);
  }

  getAllDependencies(): Dependency[] {
    return this.dependencies.dependencies.concat(this.devDependencies.dependencies);
  }

  hasDependencies(): boolean {
    return !this.dependencies.isEmpty() || !this.devDependencies.isEmpty();
  }

  getAllFlattenedDependencies(): BitId[] {
    return this.flattenedDependencies.concat(this.flattenedDevDependencies);
  }

  async buildIfNeeded({
    compiler,
    consumer,
    componentMap,
    scope,
    verbose,
    directory,
    keep
  }: {
    compiler: CompilerExtension,
    consumer?: Consumer,
    componentMap?: ComponentMap,
    scope: Scope,
    verbose: boolean,
    directory: ?string,
    keep: ?boolean
  }): Promise<?{ code: string, mappings?: string }> {
    if (!compiler) {
      return Promise.resolve({ code: '' });
    }
    const files = this.files.map(file => file.clone());

    const runBuild = async (componentRoot: string): Promise<any> => {
      let rootDistFolder = path.join(componentRoot, DEFAULT_DIST_DIRNAME);
      let componentDir;
      if (componentMap) {
        // $FlowFixMe
        rootDistFolder = this.dists.getDistDirForConsumer(consumer, componentMap.rootDir);
        componentDir =
          consumer && componentMap.rootDir ? path.join(consumer.getPath(), componentMap.rootDir) : undefined;
      }
      return Promise.resolve()
        .then(async () => {
          const context: Object = {
            componentObject: this.toObject(),
            rootDistFolder,
            componentDir
          };

          // Change the cwd to make sure we found the needed files
          process.chdir(componentRoot);
          if (compiler.action) {
            const actionParams = {
              files,
              rawConfig: compiler.rawConfig,
              dynamicConfig: compiler.dynamicConfig,
              configFiles: compiler.files,
              api: compiler.api,
              context
            };
            const result = await compiler.action(actionParams);
            // TODO: Gilad - handle return of main dist file
            if (!result || !result.files) {
              throw new Error('compiler return invalid response');
            }
            return result.files;
          }
          return compiler.oldAction(files, rootDistFolder, context);
        })
        .catch((e) => {
          throw new ExternalBuildError(e, this.id.toString());
        });
    };
    if (!compiler.action && !compiler.oldAction) {
      return Promise.reject(new InvalidCompilerInterface(compiler.name));
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
      const componentWithDependencies = await isolatedEnvironment.isolateComponent(this.id.toString(), isolateOpts);
      const component = componentWithDependencies.component;
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
    writeBitJson,
    writePackageJson,
    consumer,
    override = true,
    writeBitDependencies = false,
    deleteBitDirContent = false,
    excludeRegistryPrefix = false
  }: {
    bitDir: string,
    writeBitJson: boolean,
    writePackageJson: boolean,
    consumer?: Consumer,
    override?: boolean,
    writeBitDependencies?: boolean,
    deleteBitDirContent?: boolean,
    excludeRegistryPrefix?: boolean
  }) {
    if (deleteBitDirContent) {
      fs.emptyDirSync(bitDir);
    } else {
      await mkdirp(bitDir);
    }
    if (this.files) await Promise.all(this.files.map(file => file.write(undefined, override)));
    await this.dists.writeDists(this, consumer, false);
    if (writeBitJson) await this.writeConfig(bitDir, consumer.dirStructure.ejectedEnvsDirStructure, override);
    // make sure the project's package.json is not overridden by Bit
    // If a consumer is of isolated env it's ok to override the root package.json (used by the env installation
    // of compilers / testers / extensions)
    if (writePackageJson && (consumer.isolated || bitDir !== consumer.getPath())) {
      await this.writePackageJson(consumer, bitDir, override, writeBitDependencies, excludeRegistryPrefix);
    }
    if (this.license && this.license.src) await this.license.write(bitDir, override);
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
    if (originallySharedDir) {
      logger.debug(`stripping originallySharedDir "${originallySharedDir}" from ${this.id}`);
    }
    const pathWithoutSharedDir = (pathStr: PathOsBased, sharedDir: PathLinux): PathOsBased => {
      if (!sharedDir) return pathStr;
      const partToRemove = path.normalize(sharedDir) + path.sep;
      return pathStr.replace(partToRemove, '');
    };
    this.files.forEach((file) => {
      const newRelative = pathWithoutSharedDir(file.relative, originallySharedDir);
      file.updatePaths({ newBase: file.base, newRelative });
    });
    this.dists.stripOriginallySharedDir(originallySharedDir, pathWithoutSharedDir);
    this.mainFile = pathWithoutSharedDir(this.mainFile, originallySharedDir);
    this.dependencies.stripOriginallySharedDir(bitMap, originallySharedDir);
    this.devDependencies.stripOriginallySharedDir(bitMap, originallySharedDir);
    this.customResolvedPaths.forEach((customPath) => {
      customPath.destinationPath = pathNormalizeToLinux(
        pathWithoutSharedDir(path.normalize(customPath.destinationPath), originallySharedDir)
      );
    });
    this._wasOriginallySharedDirStripped = true;
  }

  addSharedDir(pathStr: string): PathLinux {
    const withSharedDir = this.originallySharedDir ? path.join(this.originallySharedDir, pathStr) : pathStr;
    return pathNormalizeToLinux(withSharedDir);
  }

  cloneFilesWithSharedDir(): SourceFile[] {
    return this.files.map((file) => {
      const newFile = file.clone();
      const newRelative = this.addSharedDir(file.relative);
      newFile.updatePaths({ newBase: file.base, newRelative });
      return newFile;
    });
  }

  /**
   * When using this function please check if you really need to pass the bitDir or not
   * It's better to init the files with the correct base, cwd and path than pass it here
   * It's mainly here for cases when we write from the model so this is the first point we actually have the dir
   */
  async write({
    bitDir,
    writeBitJson = true,
    writePackageJson = true,
    override = true,
    origin,
    parent,
    consumer,
    writeBitDependencies = false,
    deleteBitDirContent,
    componentMap,
    excludeRegistryPrefix = false
  }: {
    bitDir?: string,
    writeBitJson?: boolean,
    writePackageJson?: boolean,
    override?: boolean,
    origin?: string,
    parent?: BitId,
    consumer?: Consumer,
    writeBitDependencies?: boolean,
    deleteBitDirContent?: boolean,
    componentMap: ComponentMap,
    excludeRegistryPrefix?: boolean
  }): Promise<Component> {
    logger.debug(`consumer-component.write, id: ${this.id.toString()}`);
    const consumerPath: ?string = consumer ? consumer.getPath() : undefined;
    const bitMap: ?BitMap = consumer ? consumer.bitMap : undefined;
    if (!this.files) throw new GeneralError(`Component ${this.id.toString()} is invalid as it has no files`);
    // Take the bitdir from the files (it will be the same for all the files of course)
    const calculatedBitDir = bitDir || this.files[0].base;
    // Update files base dir according to bitDir
    if (this.files && bitDir) this.files.forEach(file => file.updatePaths({ newBase: bitDir }));
    if (!this.dists.isEmpty() && bitDir) this.dists.get().forEach(dist => dist.updatePaths({ newBase: bitDir }));

    // if bitMap parameter is empty, for instance, when it came from the scope, ignore bitMap altogether.
    // otherwise, check whether this component is in bitMap:
    // if it's there, write the files according to the paths in bit.map.
    // Otherwise, write to bitDir and update bitMap with the new paths.
    if (!bitMap) {
      return this._writeToComponentDir({
        bitDir: calculatedBitDir,
        writeBitJson,
        writePackageJson,
        consumer,
        override,
        writeBitDependencies,
        excludeRegistryPrefix
      });
    }
    if (!componentMap) {
      // if there is no componentMap, the component is new to this project and should be written to bit.map
      componentMap = this._addComponentToBitMap(bitMap, calculatedBitDir, origin, parent);
    }
    if (!consumer.shouldDistsBeInsideTheComponent() && this.dists.isEmpty()) {
      // since the dists are set to be outside the components dir, the source files must be saved there
      // otherwise, other components in dists won't be able to link to this component
      this.copyFilesIntoDists();
    }
    // For IMPORTED component we have to delete the content of the directory before importing.
    // Otherwise, when the author adds new files outside of the previous originallySharedDir and this user imports them
    // the environment will contain both copies, the old one with the old originallySharedDir and the new one.
    // If a user made changes to the imported component, it will show a warning and stop the process.
    if (typeof deleteBitDirContent === 'undefined') {
      deleteBitDirContent = origin === COMPONENT_ORIGINS.IMPORTED;
    }
    // when there is componentMap, this component (with this version or other version) is already part of the project.
    // There are several options as to what was the origin before and what is the origin now and according to this,
    // we update/remove/don't-touch the record in bit.map.
    // The current origin can't be AUTHORED because when the author creates a component for the first time,
    // 1) current origin is AUTHORED - If the version is the same as before, don't update bit.map. Otherwise, update.
    // 2) current origin is IMPORTED - If the version is the same as before, don't update bit.map. Otherwise, update.
    // one exception is where the origin was NESTED before, in this case, remove the current record and add a new one.
    // 3) current origin is NESTED - the version can't be the same as before (otherwise it would be ignored before and
    // never reach this function, see @write-components.writeToComponentsDir). Therefore, always add to bit.map.
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
    if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) writeBitJson = false;
    const newBase = componentMap.rootDir ? path.join(consumerPath, componentMap.rootDir) : consumerPath;
    this.writtenPath = newBase;
    this.files.forEach(file => file.updatePaths({ newBase }));
    const rootDir = componentMap.rootDir;

    const componentMapExistWithSameVersion = bitMap.isExistWithSameVersion(this.id);
    const updateBitMap =
      !componentMapExistWithSameVersion || componentMap.originallySharedDir !== this.originallySharedDir;
    // update bitMap before writing the files to the filesystem, because as part of writing the
    // package-json file, the componentMap is needed to be stored with the updated version
    if (updateBitMap) {
      if (componentMapExistWithSameVersion) {
        // originallySharedDir has been changed. it affects also the relativePath of the files
        // so it's better to just remove the old record and add a new one
        bitMap.removeComponent(this.id);
      }
      this._addComponentToBitMap(bitMap, rootDir, origin, parent);
    }

    // Don't write the package.json for an authored component, because it's dependencies probably managed
    // By the root package.json
    const actualWithPackageJson = writePackageJson && origin !== COMPONENT_ORIGINS.AUTHORED;
    await this._writeToComponentDir({
      bitDir: newBase,
      writeBitJson,
      writePackageJson: actualWithPackageJson,
      consumer,
      override,
      writeBitDependencies,
      deleteBitDirContent,
      excludeRegistryPrefix
    });

    return this;
  }

  async runSpecs({
    scope,
    rejectOnFailure = false, // reject when some (or all) of the tests were failed. relevant when running tests during 'bit tag'
    consumer,
    save,
    verbose,
    isolated,
    directory,
    keep
  }: {
    scope: Scope,
    rejectOnFailure?: boolean,
    consumer?: Consumer,
    save?: boolean,
    verbose?: boolean,
    isolated?: boolean,
    directory?: string,
    keep?: boolean
  }): Promise<?SpecsResults> {
    const testFiles = this.files.filter(file => file.test);
    if (!this.tester || !testFiles || R.isEmpty(testFiles)) return null;

    logger.debug('tester found, start running tests');
    Analytics.addBreadCrumb('runSpecs', 'tester found, start running tests');
    const tester = this.tester;
    if (!tester.loaded) {
      Analytics.addBreadCrumb('runSpecs', 'installing missing tester');
      await tester.install(scope, { verbose });
      logger.debug('Environment components are installed');
    }

    const testerFilePath = tester.filePath;

    const run = async (component: ConsumerComponent, cwd?: PathOsBased) => {
      // Change the cwd to make sure we found the needed files
      if (cwd) {
        logger.debug(`changing process cwd to ${cwd}`);
        Analytics.addBreadCrumb('runSpecs.run', 'changing process cwd');
        process.chdir(cwd);
      }
      loader.start(BEFORE_RUNNING_SPECS);
      const testFilesList = !component.dists.isEmpty()
        ? component.dists.get().filter(dist => dist.test)
        : component.files.filter(file => file.test);

      let specsResults: RawTestsResults[];

      try {
        if (tester.action) {
          logger.debug('running tests using new format');
          Analytics.addBreadCrumb('runSpecs.run', 'running tests using new format');
          const context: Object = {
            componentObject: component.toObject()
          };
          const actionParams = {
            testFiles: testFilesList,
            rawConfig: tester.rawConfig,
            dynamicConfig: tester.dynamicConfig,
            configFiles: tester.files,
            api: tester.api,
            context
          };

          specsResults = await tester.action(actionParams);
        } else {
          logger.debug('running tests using old format');
          Analytics.addBreadCrumb('runSpecs.run', 'running tests using old format');
          const oneFileSpecResult = async (testFile) => {
            const testFilePath = testFile.path;
            try {
              const results = await tester.oldAction(testFilePath);
              results.specPath = testFile.relative;
              return results;
            } catch (err) {
              const failures = [
                {
                  title: err.message,
                  err
                }
              ];
              const results = {
                specPath: testFile.relative,
                pass: false,
                tests: [],
                failures
              };
              return results;
            }
          };
          const specsResultsP = testFilesList.map(oneFileSpecResult);
          specsResults = await Promise.all(specsResultsP);
        }
      } catch (err) {
        throw new ExternalTestError(err, this.id.toString());
      }

      this.specsResults = specsResults.map(specRes => SpecsResults.createFromRaw(specRes));

      if (rejectOnFailure && !this.specsResults.every(element => element.pass)) {
        // some or all the tests were failed.
        loader.stop();
        if (verbose) {
          // $FlowFixMe this.specsResults is not null at this point
          const specsResultsPretty = paintSpecsResults(this.specsResults).join('\n');
          const componentIdPretty = c.bold.white(this.id.toString());
          const specsResultsAndIdPretty = `${componentIdPretty}${specsResultsPretty}\n`;
          return Promise.reject(new ComponentSpecsFailed(specsResultsAndIdPretty));
        }
        return Promise.reject(new ComponentSpecsFailed());
      }

      if (save) {
        await scope.sources.modifySpecsResults({
          source: this,
          specsResults: this.specsResults
        });
      }

      return this.specsResults;
    };

    if (!isolated && consumer) {
      logger.debug('Building the component before running the tests');
      await this.build({ scope, verbose, consumer });
      await this.dists.writeDists(this, consumer);
      return run(this, consumer.getPath());
    }

    const isolatedEnvironment = new IsolatedEnvironment(scope, directory);

    try {
      await isolatedEnvironment.create();
      const isolateOpts = {
        verbose,
        dist: true,
        installPackages: true,
        installPeerDependencies: true,
        noPackageJson: false
      };
      const localTesterPath = path.join(isolatedEnvironment.getPath(), 'tester');
      const componentWithDependencies = await isolatedEnvironment.isolateComponent(this.id.toString(), isolateOpts);

      createSymlinkOrCopy(testerFilePath, localTesterPath);
      const component = componentWithDependencies.component;
      component.isolatedEnvironment = isolatedEnvironment;
      logger.debug(`the component ${this.id.toString()} has been imported successfully into an isolated environment`);

      await component.build({ scope, verbose });
      if (!component.dists.isEmpty()) {
        const specDistWrite = component.dists.get().map(file => file.write());
        await Promise.all(specDistWrite);
      }

      const results = await run(component);
      if (!keep) await isolatedEnvironment.destroy();
      return results;
    } catch (e) {
      await isolatedEnvironment.destroy();
      return Promise.reject(e);
    }
  }

  async build({
    scope,
    save,
    consumer,
    verbose,
    keep
  }: {
    scope: Scope,
    save?: boolean,
    consumer?: Consumer,
    verbose?: boolean,
    keep?: boolean
  }): Promise<?Dists> {
    logger.debug(`consumer-component.build ${this.id.toString()}`);
    // @TODO - write SourceMap Type
    if (!this.compiler) {
      if (!consumer || consumer.shouldDistsBeInsideTheComponent()) {
        logger.debug('compiler was not found, nothing to build');
        return null;
      }
      logger.debug(
        'compiler was not found, however, because the dists are set to be outside the components directory, save the source file as dists'
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
    const bitMap = consumer ? consumer.bitMap : undefined;
    const consumerPath = consumer ? consumer.getPath() : '';
    const componentMap = bitMap && bitMap.getComponent(this.id.toString());
    let componentDir = consumerPath;
    if (componentMap) {
      componentDir = consumerPath && componentMap.rootDir ? path.join(consumerPath, componentMap.rootDir) : undefined;
    }
    const needToRebuild = await isNeededToReBuild();
    if (!needToRebuild && !this.dists.isEmpty()) {
      logger.debug('skip the build process as the component was not modified, use the dists saved in the model');
      if (componentMap && componentMap.origin === COMPONENT_ORIGINS.IMPORTED) {
        this.stripOriginallySharedDir(bitMap);
        // don't worry about the dist.entry and dist.target at this point. It'll be done later on once the files are
        // written, probably by this.dists.writeDists()
      }

      return this.dists;
    }
    logger.debug('compiler found, start building');
    if (!this.compiler.loaded) {
      await this.compiler.install(
        scope,
        { verbose },
        { workspaceDir: consumerPath, componentDir, dependentId: this.id }
      );
    }

    const builtFiles = await this.buildIfNeeded({
      compiler: this.compiler,
      consumer,
      componentMap,
      scope,
      keep,
      verbose
    });
    // return buildFilesP.then((buildedFiles) => {
    builtFiles.forEach((file) => {
      if (file && (!file.contents || !isString(file.contents.toString()))) {
        throw new GeneralError('builder interface has to return object with a code attribute that contains string');
      }
    });
    this.setDists(builtFiles.map(file => new Dist(file)));

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
      throw new GeneralError(err);
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
      compiler: this.compiler ? this.compiler.toObject() : null,
      tester: this.tester ? this.tester.toObject() : null,
      dependencies: this.dependencies.serialize(),
      devDependencies: this.devDependencies.serialize(),
      packageDependencies: this.packageDependencies,
      devPackageDependencies: this.devPackageDependencies,
      peerPackageDependencies: this.peerPackageDependencies,
      envsPackageDependencies: this.envsPackageDependencies,
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

  copyFilesIntoDists() {
    const dists = this.files.map(file => new Dist({ base: file.base, path: file.path, contents: file.contents }));
    this.setDists(dists);
  }

  /**
   * find a shared directory among the files of the main component and its dependencies
   */
  setOriginallySharedDir(): void {
    if (this.originallySharedDir !== undefined) return;
    // taken from https://stackoverflow.com/questions/1916218/find-the-longest-common-starting-substring-in-a-set-of-strings
    // It sorts the array, and then looks just at the first and last items
    const sharedStartOfArray = (array) => {
      const sortedArray = array.concat().sort();
      const firstItem = sortedArray[0];
      const lastItem = sortedArray[sortedArray.length - 1];
      let i = 0;
      while (i < firstItem.length && firstItem.charAt(i) === lastItem.charAt(i)) i += 1;
      return firstItem.substring(0, i);
    };
    const pathSep = '/'; // it works for Windows as well as all paths are normalized to Linux
    const filePaths = this.files.map(file => pathNormalizeToLinux(file.relative));
    const dependenciesPaths = this.dependencies.getSourcesPaths();
    const devDependenciesPaths = this.devDependencies.getSourcesPaths();
    const allPaths = [...filePaths, ...dependenciesPaths, ...devDependenciesPaths];
    const sharedStart = sharedStartOfArray(allPaths);
    if (!sharedStart || !sharedStart.includes(pathSep)) return;
    const lastPathSeparator = sharedStart.lastIndexOf(pathSep);
    this.originallySharedDir = sharedStart.substring(0, lastPathSeparator);
  }

  async toComponentWithDependencies(consumer: Consumer): Promise<ComponentWithDependencies> {
    const getFlatten = (dev: boolean = false): BitIds => {
      const field = dev ? 'flattenedDevDependencies' : 'flattenedDependencies';
      // when loaded from filesystem, it doesn't have the flatten, fetch them from model.
      return this.loadedFromFileSystem ? this.componentFromModel[field] : this[field];
    };
    const getDependenciesComponents = (ids: BitIds) => {
      return Promise.all(
        ids.map((dependencyId) => {
          if (consumer.bitMap.isExistWithSameVersion(dependencyId)) {
            return consumer.loadComponent(dependencyId);
          }
          // when dependencies are imported as npm packages, they are not in bit.map
          this.dependenciesSavedAsComponents = false;
          return consumer.scope.loadComponent(dependencyId, false);
        })
      );
    };

    const dependencies = await getDependenciesComponents(getFlatten());
    const devDependencies = await getDependenciesComponents(getFlatten(true));
    return new ComponentWithDependencies({ component: this, dependencies, devDependencies });
  }

  copyDependenciesFromModel(ids: string[]) {
    const componentFromModel = this.componentFromModel;
    if (!componentFromModel) throw new Error('copyDependenciesFromModel: component is missing from the model');
    ids.forEach((id: string) => {
      const dependency = componentFromModel.dependencies.getById(id);
      if (dependency) this.dependencies.add(dependency);
      else {
        const devDependency = componentFromModel.devDependencies.getById(id);
        if (!devDependency) throw new Error(`copyDependenciesFromModel unable to find dependency ${id} in the model`);
        this.devDependencies.add(dependency);
      }
    });
  }

  static fromObject(object: Object): Component {
    const {
      name,
      box,
      version,
      scope,
      lang,
      bindingPrefix,
      compiler,
      tester,
      dependencies,
      devDependencies,
      packageDependencies,
      devPackageDependencies,
      peerPackageDependencies,
      envsPackageDependencies,
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
      compiler: compiler ? CompilerExtension.loadFromModelObject(compiler) : null,
      tester: tester ? TesterExtension.loadFromModelObject(tester) : null,
      dependencies,
      devDependencies,
      packageDependencies,
      devPackageDependencies,
      peerPackageDependencies,
      envsPackageDependencies,
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
    bitDir,
    componentMap,
    id,
    consumer,
    componentFromModel
  }: {
    bitDir: PathOsBased,
    componentMap: ComponentMap,
    id: BitId,
    consumer: Consumer,
    componentFromModel: Component
  }): Promise<Component> {
    const consumerPath = consumer.getPath();
    const consumerBitJson: ConsumerBitJson = consumer.bitJson;
    const bitMap: BitMap = consumer.bitMap;
    const deprecated = componentFromModel ? componentFromModel.deprecated : false;
    let dists = componentFromModel ? componentFromModel.dists.get() : undefined;
    let packageDependencies;
    let devPackageDependencies;
    let peerPackageDependencies;
    const getLoadedFiles = async (): Promise<SourceFile[]> => {
      const sourceFiles = [];
      await componentMap.trackDirectoryChanges(consumer, id);
      const filesToDelete = [];
      componentMap.files.forEach((file) => {
        const filePath = path.join(bitDir, file.relativePath);
        try {
          const sourceFile = SourceFile.load(filePath, consumerBitJson.distTarget, bitDir, consumerPath, {
            test: file.test
          });
          sourceFiles.push(sourceFile);
        } catch (err) {
          if (!(err instanceof FileSourceNotFound)) throw err;
          logger.warn(`a file ${filePath} will be deleted from bit.map as it does not exist on the file system`);
          filesToDelete.push(file);
        }
      });
      if (filesToDelete.length && !sourceFiles.length) {
        throw new MissingFilesFromComponent(id.toString());
      }
      if (filesToDelete.length) {
        componentMap.removeFiles(filesToDelete);
        bitMap.hasChanged = true;
      }
      return sourceFiles;
    };

    if (!fs.existsSync(bitDir)) throw new ComponentNotFoundInPath(bitDir);
    // Load the base entry from the root dir in map file in case it was imported using -path
    // Or created using bit create so we don't want all the path but only the relative one
    // Check that bitDir isn't the same as consumer path to make sure we are not loading global stuff into component
    // (like dependencies)
    let componentBitJson: ComponentBitJson | typeof undefined;
    let componentBitJsonFileExist = false;
    let rawComponentBitJson;
    if (bitDir !== consumerPath) {
      componentBitJson = ComponentBitJson.loadSync(bitDir, consumerBitJson);
      packageDependencies = componentBitJson.packageDependencies;
      devPackageDependencies = componentBitJson.devPackageDependencies;
      peerPackageDependencies = componentBitJson.peerPackageDependencies;
      // by default, imported components are not written with bit.json file.
      // use the component from the model to get their bit.json values
      componentBitJsonFileExist = await AbstractBitJson.hasExisting(bitDir);
      if (componentBitJsonFileExist) {
        rawComponentBitJson = componentBitJson;
      }
      if (!componentBitJsonFileExist && componentFromModel) {
        componentBitJson.mergeWithComponentData(componentFromModel);
      }
    }
    // for authored componentBitJson is normally undefined
    const bitJson = componentBitJson || consumerBitJson;

    // Remove dists if compiler has been deleted
    if (dists && !bitJson.hasCompiler()) {
      dists = undefined;
    }

    const envsContext = {
      componentDir: bitDir,
      workspaceDir: consumerPath
    };

    const propsToLoadEnvs = {
      consumerPath,
      scopePath: consumer.scope.getPath(),
      componentOrigin: componentMap.origin,
      componentFromModel,
      consumerBitJson,
      componentBitJson: rawComponentBitJson,
      context: envsContext
    };

    const compilerP = CompilerExtension.loadFromCorrectSource(propsToLoadEnvs);
    const testerP = TesterExtension.loadFromCorrectSource(propsToLoadEnvs);

    const [compiler, tester] = await Promise.all([compilerP, testerP]);

    // Load the envsPackageDependencies from the actual compiler / tester or from the model
    // if they are not loaded (aka not installed)
    // We load it from model to prevent case when component is modified becasue changes in envsPackageDependencies
    // That occur as a result that we import component but didn't import its envs so we can't
    // calculate the envsPackageDependencies (without install the env, which we don't want)
    const compilerDynamicPackageDependencies = compiler && compiler.loaded ? compiler.dynamicPackageDependencies : {};
    const testerDynamicPackageDependencies = tester && tester.loaded ? tester.dynamicPackageDependencies : {};
    const modelEnvsPackageDependencies = componentFromModel ? componentFromModel.envsPackageDependencies || {} : {};
    const envsPackageDependencies = {
      ...modelEnvsPackageDependencies,
      ...testerDynamicPackageDependencies,
      ...compilerDynamicPackageDependencies
    };

    return new Component({
      name: id.name,
      box: id.box,
      scope: id.scope,
      version: id.version,
      lang: bitJson.lang,
      bindingPrefix: bitJson.bindingPrefix || DEFAULT_BINDINGS_PREFIX,
      compiler,
      tester,
      bitJson: componentBitJsonFileExist ? componentBitJson : undefined,
      mainFile: componentMap.mainFile,
      files: await getLoadedFiles(),
      dists,
      packageDependencies,
      devPackageDependencies,
      peerPackageDependencies,
      envsPackageDependencies,
      deprecated
    });
  }
}
