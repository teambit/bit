// @flow
import path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import c from 'chalk';
import { mkdirp, pathNormalizeToLinux, createSymlinkOrCopy } from '../../utils';
import ComponentBitJson from '../bit-json';
import { Dist, License, SourceFile } from '../component/sources';
import ConsumerBitJson from '../bit-json/consumer-bit-json';
import Consumer from '../consumer';
import BitId from '../../bit-id/bit-id';
import Scope from '../../scope/scope';
import BitIds from '../../bit-id/bit-ids';
import docsParser from '../../jsdoc/parser';
import type { Doclet } from '../../jsdoc/parser';
import SpecsResults from '../specs-results';
import ejectConf, { writeEnvFiles } from '../component-ops/eject-conf';
import injectConf from '../component-ops/inject-conf';
import type { EjectConfResult } from '../component-ops/eject-conf';
import ComponentSpecsFailed from '../exceptions/component-specs-failed';
import MissingFilesFromComponent from './exceptions/missing-files-from-component';
import ComponentNotFoundInPath from './exceptions/component-not-found-in-path';
import IsolatedEnvironment, { IsolateOptions } from '../../environment';
import type { Log } from '../../scope/models/version';
import BitMap from '../bit-map';
import ComponentMap from '../bit-map/component-map';
import type { ComponentOrigin } from '../bit-map/component-map';
import logger from '../../logger/logger';
import loader from '../../cli/loader';
import CompilerExtension, { COMPILER_ENV_TYPE } from '../../extensions/compiler-extension';
import TesterExtension, { TESTER_ENV_TYPE } from '../../extensions/tester-extension';
import { Driver } from '../../driver';
import { BEFORE_RUNNING_SPECS } from '../../cli/loader/loader-messages';
import FileSourceNotFound from './exceptions/file-source-not-found';
import {
  DEFAULT_LANGUAGE,
  DEFAULT_BINDINGS_PREFIX,
  COMPONENT_ORIGINS,
  BIT_WORKSPACE_TMP_DIRNAME,
  WRAPPER_DIR,
  PACKAGE_JSON
} from '../../constants';
import ComponentWithDependencies from '../../scope/component-dependencies';
import * as packageJson from './package-json';
import { Dependency, Dependencies } from './dependencies';
import Dists from './sources/dists';
import type { PathLinux, PathOsBased, PathOsBasedAbsolute } from '../../utils/path';
import type { RawTestsResults } from '../specs-results/specs-results';
import { paintSpecsResults } from '../../cli/chalk-box';
import ExternalTestErrors from './exceptions/external-test-errors';
import GeneralError from '../../error/general-error';
import AbstractBitJson from '../bit-json/abstract-bit-json';
import { Analytics } from '../../analytics/analytics';
import type { PackageJsonInstance } from './package-json';
import { componentIssuesLabels } from '../../cli/templates/component-issues-template';
import MainFileRemoved from './exceptions/main-file-removed';
import EnvExtension from '../../extensions/env-extension';
import EjectToWorkspace from './exceptions/eject-to-workspace';
import EjectBoundToWorkspace from './exceptions/eject-bound-to-workspace';
import Version from '../../version';
import InjectNonEjected from './exceptions/inject-non-ejected';
import ConfigDir from '../bit-map/config-dir';
import buildComponent from '../component-ops/build-component';
import ExtensionFileNotFound from '../../extensions/exceptions/extension-file-not-found';
import type { ManipulateDirItem } from '../component-ops/manipulate-dir';

export type customResolvedPath = { destinationPath: PathLinux, importSource: string };

export type InvalidComponent = { id: BitId, error: Error };

export type ComponentProps = {
  name: string,
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
  compilerDependencies?: Dependency[],
  testerDependencies?: Dependency[],
  flattenedDependencies?: ?BitIds,
  flattenedDevDependencies?: ?BitIds,
  flattenedCompilerDependencies?: ?BitIds,
  flattenedTesterDependencies?: ?BitIds,
  packageDependencies?: ?Object,
  devPackageDependencies?: ?Object,
  peerPackageDependencies?: ?Object,
  compilerPackageDependencies?: ?Object,
  testerPackageDependencies?: ?Object,
  customResolvedPaths?: ?(customResolvedPath[]),
  files: SourceFile[],
  docs?: ?(Doclet[]),
  dists?: Dist[],
  specsResults?: ?SpecsResults,
  license?: ?License,
  deprecated: ?boolean,
  origin: ComponentOrigin,
  detachedCompiler?: ?boolean,
  detachedTester?: ?boolean,
  log?: ?Log
};

export default class Component {
  name: string;
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
  compilerDependencies: Dependencies;
  testerDependencies: Dependencies;
  flattenedDependencies: BitIds;
  flattenedDevDependencies: BitIds;
  flattenedCompilerDependencies: BitIds;
  flattenedTesterDependencies: BitIds;
  packageDependencies: Object;
  devPackageDependencies: Object;
  peerPackageDependencies: Object;
  compilerPackageDependencies: Object;
  testerPackageDependencies: Object;
  _docs: ?(Doclet[]);
  files: SourceFile[];
  dists: Dists;
  specsResults: ?(SpecsResults[]);
  license: ?License;
  log: ?Log;
  writtenPath: ?string; // needed for generate links
  dependenciesSavedAsComponents: ?boolean = true; // otherwise they're saved as npm packages
  originallySharedDir: ?PathLinux; // needed to reduce a potentially long path that was used by the author
  _wasOriginallySharedDirStripped: ?boolean; // whether stripOriginallySharedDir() method had been called, we don't want to strip it twice
  wrapDir: ?PathLinux; // needed when a user adds a package.json file to the component root
  loadedFromFileSystem: boolean = false; // whether a component was loaded from the filesystem or converted from the model
  componentMap: ?ComponentMap; // always populated when the loadedFromFileSystem is true
  componentFromModel: ?Component; // populated when loadedFromFileSystem is true and it exists in the model
  isolatedEnvironment: IsolatedEnvironment;
  issues: { [label: $Keys<typeof componentIssuesLabels>]: { [fileName: string]: string[] | BitId[] | string | BitId } };
  deprecated: boolean;
  origin: ComponentOrigin;
  detachedCompiler: ?boolean;
  detachedTester: ?boolean;
  customResolvedPaths: customResolvedPath[];
  _driver: Driver;
  _isModified: boolean;
  packageJsonInstance: PackageJsonInstance;
  _currentlyUsedVersion: BitId; // used by listScope functionality
  pendingVersion: Version; // used during tagging process. It's the version that going to be saved or saved already in the model

  get id(): BitId {
    return new BitId({
      scope: this.scope,
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
    version,
    scope,
    files,
    lang,
    bindingPrefix,
    mainFile,
    compiler,
    tester,
    bitJson,
    dependencies,
    devDependencies,
    compilerDependencies,
    testerDependencies,
    flattenedDependencies,
    flattenedDevDependencies,
    flattenedCompilerDependencies,
    flattenedTesterDependencies,
    packageDependencies,
    devPackageDependencies,
    peerPackageDependencies,
    compilerPackageDependencies,
    testerPackageDependencies,
    docs,
    dists,
    specsResults,
    license,
    log,
    deprecated,
    origin,
    detachedCompiler,
    detachedTester,
    customResolvedPaths
  }: ComponentProps) {
    this.name = name;
    this.version = version;
    this.scope = scope;
    this.files = files;
    this.lang = lang || DEFAULT_LANGUAGE;
    this.bindingPrefix = bindingPrefix || DEFAULT_BINDINGS_PREFIX;
    this.mainFile = path.normalize(mainFile);
    this.compiler = compiler;
    this.tester = tester;
    this.bitJson = bitJson;
    this.setDependencies(dependencies);
    this.setDevDependencies(devDependencies);
    this.setCompilerDependencies(compilerDependencies);
    this.setTesterDependencies(testerDependencies);
    this.flattenedDependencies = flattenedDependencies || new BitIds();
    this.flattenedDevDependencies = flattenedDevDependencies || new BitIds();
    this.flattenedCompilerDependencies = flattenedCompilerDependencies || new BitIds();
    this.flattenedTesterDependencies = flattenedTesterDependencies || new BitIds();
    this.packageDependencies = packageDependencies || {};
    this.devPackageDependencies = devPackageDependencies || {};
    this.peerPackageDependencies = peerPackageDependencies || {};
    this.compilerPackageDependencies = compilerPackageDependencies || {};
    this.testerPackageDependencies = testerPackageDependencies || {};
    this._docs = docs;
    this.setDists(dists);
    this.specsResults = specsResults;
    this.license = license;
    this.log = log;
    this.deprecated = deprecated || false;
    this.origin = origin;
    this.detachedCompiler = detachedCompiler;
    this.detachedTester = detachedTester;
    this.customResolvedPaths = customResolvedPaths || [];
    this.validateComponent();
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
   * Warning: this method does not return a deep copy for objects properties except dependencies and devDependencies
   * Implement deep copy of other properties if needed
   */
  clone() {
    // $FlowFixMe
    const newInstance: Component = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    newInstance.setDependencies(this.dependencies.getClone());
    newInstance.setDevDependencies(this.devDependencies.getClone());
    newInstance.setCompilerDependencies(this.compilerDependencies.getClone());
    newInstance.setTesterDependencies(this.testerDependencies.getClone());
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
    // Isolated components (for ci-update for example)
    if (this.isolatedEnvironment && this.writtenPath) {
      // Do not join the workspacePrefix since the written path is already a full path
      folder = path.join(this.writtenPath, BIT_WORKSPACE_TMP_DIRNAME);
    }
    return folder;
  }

  setDependencies(dependencies?: Dependency[]) {
    this.dependencies = new Dependencies(dependencies);
  }

  setDevDependencies(devDependencies?: Dependency[]) {
    this.devDependencies = new Dependencies(devDependencies);
  }

  setCompilerDependencies(compilerDependencies?: Dependency[]) {
    this.compilerDependencies = new Dependencies(compilerDependencies);
  }

  setTesterDependencies(testerDependencies?: Dependency[]) {
    this.testerDependencies = new Dependencies(testerDependencies);
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

  getDetachedCompiler(): boolean {
    return _calculateDetachByOrigin(this.detachedCompiler, this.origin);
  }

  getDetachedTester(): boolean {
    return _calculateDetachByOrigin(this.detachedTester, this.origin);
  }

  _getHomepage() {
    // TODO: Validate somehow that this scope is really on bitsrc (maybe check if it contains . ?)
    const homepage = this.scope ? `https://bitsrc.io/${this.scope.replace('.', '/')}/${this.name}` : undefined;
    return homepage;
  }

  async writeConfig(
    consumer: Consumer,
    configDir: PathOsBased | ConfigDir,
    override?: boolean = true
  ): Promise<EjectConfResult> {
    const bitMap: BitMap = consumer.bitMap;
    this.componentMap = this.componentMap || bitMap.getComponentIfExist(this.id);
    const componentMap = this.componentMap;
    if (!componentMap) {
      throw new GeneralError('could not find component in the .bitmap file');
    }
    const configDirInstance = typeof configDir === 'string' ? new ConfigDir(configDir) : configDir.clone();
    if (configDirInstance.isWorkspaceRoot) {
      throw new EjectToWorkspace();
    }
    // Nothing is detached.. no reason to eject
    if (
      (componentMap.origin === COMPONENT_ORIGINS.AUTHORED &&
        !componentMap.detachedCompiler &&
        !componentMap.detachedTester) ||
      // Need to be check for false and not falsy for imported components
      (componentMap.detachedCompiler === false && componentMap.detachedTester === false)
    ) {
      throw new EjectBoundToWorkspace();
    }

    const res = await ejectConf(this, consumer, configDirInstance, override);
    if (this.componentMap) {
      this.componentMap.setConfigDir(res.ejectedPath);
    }
    return res;
  }

  async injectConfig(consumerPath: PathOsBased, bitMap: BitMap, force?: boolean = false): Promise<EjectConfResult> {
    this.componentMap = this.componentMap || bitMap.getComponentIfExist(this.id);
    const componentMap = this.componentMap;
    if (!componentMap) {
      throw new GeneralError('could not find component in the .bitmap file');
    }
    const configDir = componentMap.configDir;
    if (!configDir) {
      throw new InjectNonEjected();
    }

    const res = await injectConf(this, consumerPath, bitMap, configDir, force);
    if (this.componentMap) {
      this.componentMap.setConfigDir();
    }
    return res;
  }

  getPackageNameAndPath(): Promise<any> {
    const packagePath = `${this.bindingPrefix}/${this.id.name}`;
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

  flattenedCompilerDependencies(): BitIds {
    return BitIds.fromObject(this.flattenedCompilerDependencies);
  }

  flattenedTesterDependencies(): BitIds {
    return BitIds.fromObject(this.flattenedTesterDependencies);
  }

  getAllDependencies(): Dependency[] {
    return [
      ...this.dependencies.dependencies,
      ...this.devDependencies.dependencies,
      ...this.compilerDependencies.dependencies,
      ...this.testerDependencies.dependencies
    ];
  }

  getAllDependenciesCloned(): Dependencies {
    const dependencies = [
      ...this.dependencies.getClone(),
      ...this.devDependencies.getClone(),
      ...this.compilerDependencies.getClone(),
      ...this.testerDependencies.getClone()
    ];
    return new Dependencies(dependencies);
  }

  getAllNonEnvsDependencies(): Dependency[] {
    return [...this.dependencies.dependencies, ...this.devDependencies.dependencies];
  }

  getAllDependenciesIds(): BitIds {
    const allDependencies = this.getAllDependencies();
    return BitIds.fromArray(allDependencies.map(dependency => dependency.id));
  }

  hasDependencies(): boolean {
    const allDependencies = this.getAllDependencies();
    return Boolean(allDependencies.length);
  }

  getAllFlattenedDependencies(): BitId[] {
    return [
      ...this.flattenedDependencies,
      ...this.flattenedDevDependencies,
      ...this.flattenedCompilerDependencies,
      ...this.flattenedTesterDependencies
    ];
  }

  getAllNonEnvsFlattenedDependencies(): BitId[] {
    return [...this.flattenedDependencies, ...this.flattenedDevDependencies];
  }

  async _writeToComponentDir({
    bitDir,
    writeConfig,
    configDir,
    writePackageJson,
    consumer,
    override = true,
    writeBitDependencies = false,
    deleteBitDirContent = false,
    excludeRegistryPrefix = false
  }: {
    bitDir: string,
    writeConfig: boolean,
    configDir?: string,
    writePackageJson: boolean,
    consumer?: Consumer,
    override?: boolean,
    writeBitDependencies?: boolean,
    deleteBitDirContent?: boolean,
    excludeRegistryPrefix?: boolean
  }) {
    if (deleteBitDirContent) {
      logger.info(`consumer-component._writeToComponentDir, deleting ${bitDir}`);
      await fs.emptyDir(bitDir);
    } else {
      await mkdirp(bitDir);
    }
    if (this.files) await Promise.all(this.files.map(file => file.write(undefined, override)));
    await this.dists.writeDists(this, consumer, false);
    if (writeConfig && consumer) {
      const resolvedConfigDir = configDir || consumer.dirStructure.ejectedEnvsDirStructure;
      await this.writeConfig(consumer, resolvedConfigDir, override);
    }
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

  _addComponentToBitMap(
    bitMap: BitMap,
    rootDir: string,
    origin: string,
    parent?: string,
    configDir?: string
  ): ComponentMap {
    const filesForBitMap = this.files.map((file) => {
      return { name: file.basename, relativePath: pathNormalizeToLinux(file.relative), test: file.test };
    });

    return bitMap.addComponent({
      componentId: this.id,
      files: filesForBitMap,
      mainFile: this.mainFile,
      rootDir,
      configDir,
      detachedCompiler: this.detachedCompiler,
      detachedTester: this.detachedTester,
      origin,
      parent,
      originallySharedDir: this.originallySharedDir,
      wrapDir: this.wrapDir
    });
  }

  /**
   * Before writing the files into the file-system, remove the path-prefix that is shared among the main component files
   * and its dependencies. It helps to avoid large file-system paths.
   *
   * This is relevant for IMPORTED components only as the author may have long paths that are not needed for whoever
   * imports it. NESTED and AUTHORED components are written as is.
   *
   * @see sources.consumerComponentToVersion() for the opposite action. meaning, adding back the sharedDir.
   */
  stripOriginallySharedDir(manipulateDirData: ManipulateDirItem[]): void {
    if (this._wasOriginallySharedDirStripped) return;
    this.setOriginallySharedDir(manipulateDirData);
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
    this.dependencies.stripOriginallySharedDir(manipulateDirData, originallySharedDir);
    this.devDependencies.stripOriginallySharedDir(manipulateDirData, originallySharedDir);
    this.compilerDependencies.stripOriginallySharedDir(manipulateDirData, originallySharedDir);
    this.testerDependencies.stripOriginallySharedDir(manipulateDirData, originallySharedDir);
    this.customResolvedPaths.forEach((customPath) => {
      customPath.destinationPath = pathNormalizeToLinux(
        pathWithoutSharedDir(path.normalize(customPath.destinationPath), originallySharedDir)
      );
    });
    this._wasOriginallySharedDirStripped = true;
  }

  addWrapperDir(manipulateDirData: ManipulateDirItem[]): void {
    const manipulateDirItem = manipulateDirData.find(m => m.id.isEqual(this.id));
    if (!manipulateDirItem || !manipulateDirItem.wrapDir) return;
    this.wrapDir = manipulateDirItem.wrapDir;

    const pathWithWrapDir = (pathStr: PathOsBased): PathOsBased => {
      return path.join(this.wrapDir, pathStr);
    };
    this.files.forEach((file) => {
      const newRelative = pathWithWrapDir(file.relative);
      file.updatePaths({ newBase: file.base, newRelative });
    });
    // @todo: for dist also.
    this.mainFile = pathWithWrapDir(this.mainFile);
    const allDependencies = new Dependencies(this.getAllDependencies());
    allDependencies.addWrapDir(manipulateDirData, this.wrapDir);
    this.customResolvedPaths.forEach((customPath) => {
      customPath.destinationPath = pathNormalizeToLinux(pathWithWrapDir(path.normalize(customPath.destinationPath)));
    });
  }

  /**
   * When using this function please check if you really need to pass the bitDir or not
   * It's better to init the files with the correct base, cwd and path than pass it here
   * It's mainly here for cases when we write from the model so this is the first point we actually have the dir
   */
  async write({
    bitDir,
    writeConfig = false,
    configDir,
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
    writeConfig?: boolean,
    configDir?: boolean,
    writePackageJson?: boolean,
    override?: boolean,
    origin?: string,
    parent?: BitId,
    consumer?: Consumer,
    writeBitDependencies?: boolean,
    deleteBitDirContent?: boolean,
    componentMap?: ComponentMap,
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
        writeConfig,
        writePackageJson,
        consumer,
        override,
        writeBitDependencies,
        excludeRegistryPrefix
      });
    }
    if (!componentMap) {
      // if there is no componentMap, the component is new to this project and should be written to bit.map
      componentMap = this._addComponentToBitMap(bitMap, calculatedBitDir, origin, parent, configDir);
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
      bitMap.removeComponent(this.id);
      componentMap = this._addComponentToBitMap(bitMap, calculatedBitDir, origin, parent, configDir);
    }
    logger.debug('component is in bit.map, write the files according to bit.map');
    if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) writeConfig = false;
    const newBase = componentMap.rootDir ? path.join(consumerPath, componentMap.rootDir) : consumerPath;
    this.writtenPath = newBase;
    this.files.forEach(file => file.updatePaths({ newBase }));
    const rootDir = componentMap.rootDir;
    const resolvedConfigDir = configDir || componentMap.configDir;

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
      this._addComponentToBitMap(bitMap, rootDir, origin, parent, resolvedConfigDir);
    }

    // Don't write the package.json for an authored component, because it's dependencies probably managed
    // By the root package.json
    const actualWithPackageJson = writePackageJson && origin !== COMPONENT_ORIGINS.AUTHORED;
    await this._writeToComponentDir({
      bitDir: newBase,
      writeConfig,
      configDir: resolvedConfigDir,
      writePackageJson: actualWithPackageJson,
      consumer,
      override,
      writeBitDependencies,
      deleteBitDirContent,
      excludeRegistryPrefix
    });

    return this;
  }

  async build({
    scope,
    save,
    consumer,
    noCache,
    verbose,
    keep
  }: {
    scope: Scope,
    save?: boolean,
    consumer?: Consumer,
    noCache?: boolean,
    verbose?: boolean,
    keep?: boolean
  }): Promise<?Dists> {
    return buildComponent({
      component: this,
      scope,
      save,
      consumer,
      noCache,
      verbose,
      keep
    });
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
    const consumerPath = consumer ? consumer.getPath() : '';
    if (!this.tester || !testFiles || R.isEmpty(testFiles)) return null;

    logger.debug('tester found, start running tests');
    Analytics.addBreadCrumb('runSpecs', 'tester found, start running tests');
    const tester = this.tester;
    if (!tester.loaded) {
      const componentDir = this.componentMap ? this.componentMap.getComponentDir() : undefined;
      const context = { dependentId: this.id, workspaceDir: consumerPath, componentDir };
      Analytics.addBreadCrumb('runSpecs', 'installing missing tester');
      await tester.install(scope, { verbose }, context);
      logger.debug('Environment components are installed');
    }

    const testerFilePath = tester.filePath;

    const run = async (component: ConsumerComponent, cwd?: PathOsBased) => {
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
      let tmpFolderFullPath;

      let contextPaths = {};
      if (this.tester && this.tester.context) {
        contextPaths = this.tester.context;
      } else if (consumer && consumer.bitMap) {
        contextPaths = {
          workspaceDir: consumer.bitMap.projectRoot
        };
      }
      if (!contextPaths.componentDir && component.writtenPath) {
        contextPaths.componentDir = component.writtenPath;
      }
      try {
        if (tester && tester.action) {
          logger.debug('running tests using new format');
          Analytics.addBreadCrumb('runSpecs.run', 'running tests using new format');
          const shouldWriteConfig = tester.writeConfigFilesOnAction && component.getDetachedTester();
          if (shouldWriteConfig) {
            tmpFolderFullPath = component.getTmpFolder(consumerPath);
            if (verbose) {
              console.log(`\nwriting config files to ${tmpFolderFullPath}`); // eslint-disable-line no-console
            }
            await writeEnvFiles({
              fullConfigDir: tmpFolderFullPath,
              env: tester,
              consumer,
              component,
              deleteOldFiles: false,
              verbose: !!verbose
            });
          }

          const context: Object = {
            componentObject: component.toObject()
          };

          contextPaths && Object.assign(context, contextPaths);

          const actionParams = {
            testFiles: testFilesList,
            rawConfig: tester.rawConfig,
            dynamicConfig: tester.dynamicConfig,
            configFiles: tester.files,
            api: tester.api,
            context
          };

          specsResults = await tester.action(actionParams);
          if (tmpFolderFullPath) {
            if (verbose) {
              console.log(`deleting tmp directory ${tmpFolderFullPath}`); // eslint-disable-line no-console
            }
            logger.info(`consumer-component.runSpecs, deleting ${tmpFolderFullPath}`);
            await fs.remove(tmpFolderFullPath);
          }
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
      } catch (e) {
        if (tmpFolderFullPath) {
          logger.info(`consumer-component.runSpecs, deleting ${tmpFolderFullPath}`);
          fs.removeSync(tmpFolderFullPath);
        }
        const errors = e.errors || [e];
        const err = new ExternalTestErrors(component.id.toString(), errors);
        throw err;
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

      const componentWithDependencies = await isolatedEnvironment.isolateComponent(this.id, isolateOpts);

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

  async isolate(scope: Scope, opts: IsolateOptions): Promise<string> {
    const isolatedEnvironment = new IsolatedEnvironment(scope, opts.writeToPath);
    try {
      await isolatedEnvironment.create();
      await isolatedEnvironment.isolateComponent(this.id, opts);
      return isolatedEnvironment.path;
    } catch (err) {
      await isolatedEnvironment.destroy();
      throw new GeneralError(err);
    }
  }

  toObject(): Object {
    return {
      name: this.name,
      version: this.version,
      mainFile: this.mainFile,
      scope: this.scope,
      lang: this.lang,
      bindingPrefix: this.bindingPrefix,
      compiler: this.compiler ? this.compiler.toObject() : null,
      tester: this.tester ? this.tester.toObject() : null,
      detachedCompiler: this.detachedCompiler,
      detachedTester: this.detachedTester,
      dependencies: this.dependencies.serialize(),
      devDependencies: this.devDependencies.serialize(),
      compilerDependencies: this.compilerDependencies.serialize(),
      testerDependencies: this.testerDependencies.serialize(),
      packageDependencies: this.packageDependencies,
      devPackageDependencies: this.devPackageDependencies,
      peerPackageDependencies: this.peerPackageDependencies,
      compilerPackageDependencies: this.compilerPackageDependencies,
      testerPackageDependencies: this.testerPackageDependencies,
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

  setOriginallySharedDir(manipulateDirData: ManipulateDirItem[]): void {
    const manipulateDirItem = manipulateDirData.find(m => m.id.isEqual(this.id));
    if (manipulateDirItem) {
      this.originallySharedDir = manipulateDirItem.originallySharedDir;
    }
  }

  static isComponentInvalidByErrorType(err: Error): boolean {
    const invalidComponentErrors = [
      MainFileRemoved,
      MissingFilesFromComponent,
      ComponentNotFoundInPath,
      ExtensionFileNotFound
    ];
    return invalidComponentErrors.some(errorType => err instanceof errorType);
  }

  async toComponentWithDependencies(consumer: Consumer): Promise<ComponentWithDependencies> {
    const getFlatten = (field: string): BitIds => {
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
          return consumer.loadComponentFromModel(dependencyId);
        })
      );
    };

    const dependencies = await getDependenciesComponents(getFlatten('flattenedDependencies'));
    const devDependencies = await getDependenciesComponents(getFlatten('flattenedDevDependencies'));
    const compilerDependencies = await getDependenciesComponents(getFlatten('flattenedCompilerDependencies'));
    const testerDependencies = await getDependenciesComponents(getFlatten('flattenedTesterDependencies'));
    return new ComponentWithDependencies({
      component: this,
      dependencies,
      devDependencies,
      compilerDependencies,
      testerDependencies
    });
  }

  copyDependenciesFromModel(ids: string[]) {
    const componentFromModel = this.componentFromModel;
    if (!componentFromModel) throw new Error('copyDependenciesFromModel: component is missing from the model');
    ids.forEach((id: string) => {
      const addDependency = (modelDependencies: Dependencies, dependencies: Dependencies) => {
        const dependency = modelDependencies.getByIdStr(id);
        if (dependency) dependencies.add(dependency);
        return Boolean(dependency);
      };
      const addedDep = addDependency(componentFromModel.dependencies, this.dependencies);
      if (addedDep) return;
      const addedDevDep = addDependency(componentFromModel.devDependencies, this.devDependencies);
      if (addedDevDep) return;
      const addedCompilerDep = addDependency(componentFromModel.compilerDependencies, this.compilerDependencies);
      if (addedCompilerDep) return;
      const addedTesterDep = addDependency(componentFromModel.testerDependencies, this.testerDependencies);
      if (addedTesterDep) return;
      throw new Error(`copyDependenciesFromModel unable to find dependency ${id} in the model`);
    });
  }

  static async fromObject(object: Object): Component {
    const {
      name,
      box,
      version,
      scope,
      lang,
      bindingPrefix,
      compiler,
      tester,
      detachedCompiler,
      detachedTester,
      dependencies,
      devDependencies,
      compilerDependencies,
      testerDependencies,
      packageDependencies,
      devPackageDependencies,
      peerPackageDependencies,
      compilerPackageDependencies,
      testerPackageDependencies,
      docs,
      mainFile,
      dists,
      files,
      specsResults,
      license,
      deprecated
    } = object;
    return new Component({
      name: box ? `${box}/${name}` : name,
      version,
      scope,
      lang,
      bindingPrefix,
      compiler: compiler ? await CompilerExtension.loadFromModelObject(compiler) : null,
      tester: tester ? await TesterExtension.loadFromModelObject(tester) : null,
      detachedCompiler,
      detachedTester,
      dependencies,
      devDependencies,
      compilerDependencies,
      testerDependencies,
      packageDependencies,
      devPackageDependencies,
      peerPackageDependencies,
      compilerPackageDependencies,
      testerPackageDependencies,
      mainFile,
      files,
      docs,
      dists,
      specsResults: specsResults ? SpecsResults.deserialize(specsResults) : null,
      license: license ? License.deserialize(license) : null,
      deprecated: deprecated || false
    });
  }

  static async fromString(str: string): Component {
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
    bitDir: PathOsBasedAbsolute,
    componentMap: ComponentMap,
    id: BitId,
    consumer: Consumer,
    componentFromModel: Component
  }): Promise<Component> {
    const consumerPath = consumer.getPath();
    const consumerBitJson: ConsumerBitJson = consumer.bitJson;
    const bitMap: BitMap = consumer.bitMap;
    const deprecated = componentFromModel ? componentFromModel.deprecated : false;
    let configDir = consumer.getPath();
    const componentDir = componentMap.getComponentDir();
    configDir = componentDir ? path.join(configDir, componentDir) : configDir;
    let dists = componentFromModel ? componentFromModel.dists.get() : undefined;
    let packageDependencies;
    let devPackageDependencies;
    let peerPackageDependencies;
    const getLoadedFiles = async (): Promise<SourceFile[]> => {
      const sourceFiles = [];
      await componentMap.trackDirectoryChanges(consumer, id);
      const filesToDelete = [];
      const origin = componentMap.origin;
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
      if (filesToDelete.length) {
        if (!sourceFiles.length) throw new MissingFilesFromComponent(id.toString());
        filesToDelete.forEach((fileToDelete) => {
          if (fileToDelete.relativePath === componentMap.mainFile) {
            throw new MainFileRemoved(componentMap.mainFile, id.toString());
          }
        });
        componentMap.removeFiles(filesToDelete);
        bitMap.hasChanged = true;
      }
      return sourceFiles;
    };

    if (!fs.existsSync(bitDir)) throw new ComponentNotFoundInPath(bitDir);
    if (componentMap.configDir) {
      await componentMap.deleteConfigDirIfNotExists();
      const resolvedBaseConfigDir = componentMap.getBaseConfigDir();
      if (resolvedBaseConfigDir) {
        configDir = path.join(consumerPath, resolvedBaseConfigDir);
      }
    }
    // Load the base entry from the root dir in map file in case it was imported using -path
    // Or created using bit create so we don't want all the path but only the relative one
    // Check that bitDir isn't the same as consumer path to make sure we are not loading global stuff into component
    // (like dependencies)
    let componentBitJson: ComponentBitJson | typeof undefined;
    let componentBitJsonFileExist = false;
    let rawComponentBitJson;
    if (configDir !== consumerPath) {
      componentBitJson = ComponentBitJson.loadSync(configDir, consumerBitJson);
      packageDependencies = componentBitJson.packageDependencies;
      devPackageDependencies = componentBitJson.devPackageDependencies;
      peerPackageDependencies = componentBitJson.peerPackageDependencies;
      // by default, imported components are not written with bit.json file.
      // use the component from the model to get their bit.json values
      componentBitJsonFileExist = await AbstractBitJson.hasExisting(configDir);
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
      envType: COMPILER_ENV_TYPE,
      scopePath: consumer.scope.getPath(),
      componentOrigin: componentMap.origin,
      componentFromModel,
      consumerBitJson,
      componentBitJson: rawComponentBitJson,
      context: envsContext,
      detached: componentMap.detachedCompiler
    };

    const compilerP = EnvExtension.loadFromCorrectSource(propsToLoadEnvs);
    propsToLoadEnvs.detached = componentMap.detachedTester;
    propsToLoadEnvs.envType = TESTER_ENV_TYPE;
    const testerP = EnvExtension.loadFromCorrectSource(propsToLoadEnvs);

    const [compiler, tester] = await Promise.all([compilerP, testerP]);

    // Load the compilerPackageDependencies/testerPackageDependencies from the actual compiler / tester or from the model
    // if they are not loaded (aka not installed)
    // We load it from model to prevent case when component is modified becasue changes in envsPackageDependencies
    // That occur as a result that we import component but didn't import its envs so we can't
    // calculate the envsPackageDependencies (without install the env, which we don't want)
    const compilerDynamicPackageDependencies = compiler && compiler.loaded ? compiler.dynamicPackageDependencies : {};
    const testerDynamicPackageDependencies = tester && tester.loaded ? tester.dynamicPackageDependencies : {};
    const modelCompilerPackageDependencies = componentFromModel
      ? componentFromModel.compilerPackageDependencies || {}
      : {};
    const modelTesterPackageDependencies = componentFromModel ? componentFromModel.testerPackageDependencies || {} : {};
    const compilerPackageDependencies = {
      ...modelCompilerPackageDependencies,
      ...compilerDynamicPackageDependencies
    };
    const testerPackageDependencies = {
      ...modelTesterPackageDependencies,
      ...testerDynamicPackageDependencies
    };

    return new Component({
      name: id.name,
      scope: id.scope,
      version: id.version,
      lang: bitJson.lang,
      bindingPrefix: bitJson.bindingPrefix || DEFAULT_BINDINGS_PREFIX,
      compiler,
      tester,
      bitJson: componentBitJsonFileExist ? componentBitJson : undefined,
      mainFile: componentMap.mainFile,
      files: await getLoadedFiles(),
      loadedFromFileSystem: true,
      componentMap,
      dists,
      packageDependencies,
      devPackageDependencies,
      peerPackageDependencies,
      compilerPackageDependencies,
      testerPackageDependencies,
      deprecated,
      origin: componentMap.origin,
      detachedCompiler: componentMap.detachedCompiler,
      detachedTester: componentMap.detachedTester
    });
  }
}

function _calculateDetachByOrigin(detachVal: ?boolean, origin: ComponentOrigin): boolean {
  // If it was set to true it's the strongest
  if (detachVal) {
    return detachVal;
  }
  // Authored components are by default attached
  if (origin === COMPONENT_ORIGINS.AUTHORED) {
    return false;
  }
  // Not authored components are by default detached
  return true;
}
