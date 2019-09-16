// @flow
import path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import { pathNormalizeToLinux } from '../../utils';
import createSymlinkOrCopy from '../../utils/fs/create-symlink-or-copy';
import ComponentConfig from '../config';
import { Dist, License, SourceFile } from '../component/sources';
import type WorkspaceConfig from '../config/workspace-config';
import type Consumer from '../consumer';
import BitId from '../../bit-id/bit-id';
import type Scope from '../../scope/scope';
import BitIds from '../../bit-id/bit-ids';
import docsParser from '../../jsdoc/parser';
import type { Doclet } from '../../jsdoc/parser';
import SpecsResults from '../specs-results';
import { writeEnvFiles, getEjectConfDataToPersist } from '../component-ops/eject-conf';
import injectConf from '../component-ops/inject-conf';
import type { EjectConfResult, EjectConfData } from '../component-ops/eject-conf';
import ComponentSpecsFailed from '../exceptions/component-specs-failed';
import MissingFilesFromComponent from './exceptions/missing-files-from-component';
import ComponentNotFoundInPath from './exceptions/component-not-found-in-path';
import IsolatedEnvironment, { IsolateOptions } from '../../environment';
import type { Log } from '../../scope/models/version';
import type { ScopeListItem } from '../../scope/models/model-component';
import type BitMap from '../bit-map';
import ComponentMap from '../bit-map/component-map';
import type { ComponentOrigin } from '../bit-map/component-map';
import logger from '../../logger/logger';
import loader from '../../cli/loader';
import CompilerExtension from '../../extensions/compiler-extension';
import TesterExtension from '../../extensions/tester-extension';
import type { EnvType } from '../../extensions/env-extension';
import { Driver } from '../../driver';
import { BEFORE_RUNNING_SPECS } from '../../cli/loader/loader-messages';
import FileSourceNotFound from './exceptions/file-source-not-found';
import {
  DEFAULT_LANGUAGE,
  DEFAULT_BINDINGS_PREFIX,
  COMPONENT_ORIGINS,
  COMPILER_ENV_TYPE,
  TESTER_ENV_TYPE,
  BIT_WORKSPACE_TMP_DIRNAME,
  BASE_WEB_DOMAIN
} from '../../constants';
import ComponentWithDependencies from '../../scope/component-dependencies';
import { Dependency, Dependencies } from './dependencies';
import Dists from './sources/dists';
import type { PathLinux, PathOsBased, PathOsBasedAbsolute, PathOsBasedRelative } from '../../utils/path';
import type { RawTestsResults } from '../specs-results/specs-results';
import ExternalTestErrors from './exceptions/external-test-errors';
import GeneralError from '../../error/general-error';
import { Analytics } from '../../analytics/analytics';
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
import DataToPersist from './sources/data-to-persist';
import ComponentOutOfSync from '../exceptions/component-out-of-sync';
import type { OverriddenDependencies } from './dependencies/dependency-resolver/dependencies-resolver';
import ComponentOverrides from '../config/component-overrides';
import makeEnv from '../../extensions/env-factory';
import PackageJsonFile from './package-json-file';
import Isolator from '../../environment/isolator';
import Capsule from '../../../components/core/capsule';
import { stripSharedDirFromPath } from '../component-ops/manipulate-dir';

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
  bitJson: ?ComponentConfig,
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
  overrides: ComponentOverrides,
  packageJsonFile?: ?PackageJsonFile,
  packageJsonChangedProps?: ?{ [string]: any },
  files: SourceFile[],
  docs?: ?(Doclet[]),
  dists?: Dist[],
  mainDistFile?: ?PathLinux,
  specsResults?: ?SpecsResults,
  license?: ?License,
  deprecated: ?boolean,
  origin: ComponentOrigin,
  log?: ?Log,
  scopesList?: ScopeListItem[]
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
  bitJson: ?ComponentConfig;
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
  manuallyRemovedDependencies: OverriddenDependencies = {};
  manuallyAddedDependencies: OverriddenDependencies = {};
  overrides: ComponentOverrides;
  _docs: ?(Doclet[]);
  files: SourceFile[];
  dists: Dists;
  specsResults: ?(SpecsResults[]);
  license: ?License;
  log: ?Log;
  writtenPath: ?PathOsBasedRelative; // needed for generate links
  dependenciesSavedAsComponents: ?boolean = true; // otherwise they're saved as npm packages.
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
  customResolvedPaths: customResolvedPath[]; // used when in the same component, one file requires another file using custom-resolve
  _driver: Driver;
  _isModified: boolean;
  packageJsonFile: ?PackageJsonFile; // populated when loadedFromFileSystem or when writing the components. for author it never exists
  packageJsonChangedProps: ?Object; // manually changed or added by the user or by the compiler (currently, it's only populated by the build process). relevant for author also.
  _currentlyUsedVersion: BitId; // used by listScope functionality
  pendingVersion: Version; // used during tagging process. It's the version that going to be saved or saved already in the model
  dataToPersist: DataToPersist;
  scopesList: ?(ScopeListItem[]);

  get id(): BitId {
    return new BitId({
      scope: this.scope,
      name: this.name,
      version: this.version
    });
  }

  get docs(): ?(Doclet[]) {
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
    overrides,
    packageJsonFile,
    packageJsonChangedProps,
    docs,
    dists,
    mainDistFile,
    specsResults,
    license,
    log,
    deprecated,
    origin,
    customResolvedPaths,
    scopesList
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
    this.overrides = overrides;
    this.packageJsonFile = packageJsonFile;
    this.packageJsonChangedProps = packageJsonChangedProps;
    this._docs = docs || [];
    this.setDists(dists, mainDistFile ? path.normalize(mainDistFile) : null);
    this.specsResults = specsResults;
    this.license = license;
    this.log = log;
    this.deprecated = deprecated || false;
    this.origin = origin;
    this.customResolvedPaths = customResolvedPaths || [];
    this.scopesList = scopesList;
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
   * Warning: this method does not return a deep copy for all objects in this class, only for the
   * ones you see in the implementation below.
   * Implement deep copy of other properties if needed
   */
  clone() {
    // $FlowFixMe
    const newInstance: Component = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    newInstance.setDependencies(this.dependencies.getClone());
    newInstance.setDevDependencies(this.devDependencies.getClone());
    newInstance.setCompilerDependencies(this.compilerDependencies.getClone());
    newInstance.setTesterDependencies(this.testerDependencies.getClone());
    newInstance.overrides = this.overrides.clone();
    newInstance.files = this.files.map(file => file.clone());
    newInstance.dists = this.dists.clone();
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

  setDists(dists: ?(Dist[]), mainDistFile?: ?PathOsBased) {
    this.dists = new Dists(dists, mainDistFile);
  }

  getFileExtension(): string {
    switch (this.lang) {
      case DEFAULT_LANGUAGE:
      default:
        return 'js';
    }
  }

  async getDetachedCompiler(consumer: ?Consumer): Promise<boolean> {
    return this._isEnvDetach(consumer, COMPILER_ENV_TYPE);
  }

  async getDetachedTester(consumer: ?Consumer): Promise<boolean> {
    return this._isEnvDetach(consumer, TESTER_ENV_TYPE);
  }

  async _isEnvDetach(consumer: ?Consumer, envType: EnvType): Promise<boolean> {
    if (this.origin !== COMPONENT_ORIGINS.AUTHORED || !consumer) return true;

    const context = { workspaceDir: consumer.getPath() };
    const fromConsumer = await consumer.getEnv(envType, context);
    const fromComponent = this[envType] ? this[envType].toModelObject() : null;
    return EnvExtension.areEnvsDifferent(fromConsumer ? fromConsumer.toModelObject() : null, fromComponent);
  }

  _getHomepage() {
    // TODO: Validate somehow that this scope is really on bitsrc (maybe check if it contains . ?)
    const homepage = this.scope ? `https://${BASE_WEB_DOMAIN}/${this.scope.replace('.', '/')}/${this.name}` : undefined;
    return homepage;
  }

  async writeConfig(consumer: Consumer, configDir: PathOsBased | ConfigDir): Promise<EjectConfResult> {
    const ejectConfData = await this.getConfigToWrite(consumer, consumer.bitMap, configDir);
    if (consumer) ejectConfData.dataToPersist.addBasePath(consumer.getPath());
    await ejectConfData.dataToPersist.persistAllToFS();
    return ejectConfData;
  }

  async getConfigToWrite(
    consumer: ?Consumer,
    bitMap: BitMap,
    configDir: PathOsBased | ConfigDir
  ): Promise<EjectConfData> {
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

    if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) {
      const isCompilerDetached = await this.getDetachedCompiler(consumer);
      const isTesterDetached = await this.getDetachedTester(consumer);
      if (!isCompilerDetached && !isTesterDetached) throw new EjectBoundToWorkspace();
    }

    const res = await getEjectConfDataToPersist(this, consumer, consumer.bitMap, configDirInstance);
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

  /**
   * Before writing the files into the file-system, remove the path-prefix that is shared among the main component files
   * and its dependencies. It helps to avoid large file-system paths.
   *
   * This is relevant for IMPORTED and NESTED components only as the author may have long paths
   * that are not needed for whoever imports it. AUTHORED components are written as is.
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
    this.files.forEach((file) => {
      const newRelative = stripSharedDirFromPath(file.relative, originallySharedDir);
      file.updatePaths({ newBase: file.base, newRelative });
    });
    this.dists.stripOriginallySharedDir(originallySharedDir);
    this.mainFile = stripSharedDirFromPath(this.mainFile, originallySharedDir);
    this.dependencies.stripOriginallySharedDir(manipulateDirData, originallySharedDir);
    this.devDependencies.stripOriginallySharedDir(manipulateDirData, originallySharedDir);
    this.compilerDependencies.stripOriginallySharedDir(manipulateDirData, originallySharedDir);
    this.testerDependencies.stripOriginallySharedDir(manipulateDirData, originallySharedDir);
    this.customResolvedPaths.forEach((customPath) => {
      customPath.destinationPath = pathNormalizeToLinux(
        stripSharedDirFromPath(path.normalize(customPath.destinationPath), originallySharedDir)
      );
    });
    this.overrides.stripOriginallySharedDir(originallySharedDir);
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

  async build({
    scope,
    save,
    consumer,
    noCache,
    verbose,
    dontPrintEnvMsg,
    directory,
    keep
  }: {
    scope: Scope,
    save?: boolean,
    consumer?: ?Consumer,
    noCache?: boolean,
    directory?: string,
    verbose?: boolean,
    dontPrintEnvMsg?: boolean,
    keep?: boolean
  }): Promise<?Dists> {
    return buildComponent({
      component: this,
      scope,
      save,
      consumer,
      noCache,
      directory,
      verbose,
      dontPrintEnvMsg,
      keep
    });
  }

  async runSpecs({
    scope,
    rejectOnFailure = false, // reject when some (or all) of the tests were failed. relevant when running tests during 'bit tag'
    consumer,
    save,
    verbose,
    dontPrintEnvMsg,
    isolated,
    directory,
    keep
  }: {
    scope: Scope,
    rejectOnFailure?: boolean,
    consumer?: Consumer,
    save?: boolean,
    verbose?: boolean,
    dontPrintEnvMsg?: boolean,
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
      await tester.install(scope, { verbose, dontPrintEnvMsg }, context);
      logger.debug('Environment components are installed');
    }

    const testerFilePath = tester.filePath;

    const run = async (component: Component, cwd?: PathOsBased) => {
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
          const isTesterDetached = await component.getDetachedTester(consumer);
          const shouldWriteConfig = tester.writeConfigFilesOnAction && isTesterDetached;
          if (shouldWriteConfig) {
            tmpFolderFullPath = component.getTmpFolder(consumerPath);
            if (verbose) {
              console.log(`\nwriting config files to ${tmpFolderFullPath}`); // eslint-disable-line no-console
            }
            await writeEnvFiles({
              configDir: component.getTmpFolder(),
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
              const isolateFunc = async (
                destDir?: string
              ): Promise<{ capsule: Capsule, componentWithDependencies: ComponentWithDependencies }> => {
                const isolator = await Isolator.getInstance('fs', scope, consumer, destDir);
                const componentWithDependencies = await isolator.isolate(component.id, {});
                const testFileWithoutSharedDir = stripSharedDirFromPath(
                  testFilePath,
                  componentWithDependencies.component.originallySharedDir
                );
                return { capsule: isolator.capsule, componentWithDependencies, testFile: testFileWithoutSharedDir };
              };
              const context: Object = {
                componentDir: cwd,
                isolate: isolateFunc
              };

              const results = await tester.oldAction(testFilePath, context);
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
          return Promise.reject(new ComponentSpecsFailed(this.id.toString(), this.specsResults));
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
      // we got here from either bit-tag or bit-test. either way we executed already the build process
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
      if (!keep) await isolatedEnvironment.destroy();
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
      dependencies: this.dependencies.serialize(),
      devDependencies: this.devDependencies.serialize(),
      compilerDependencies: this.compilerDependencies.serialize(),
      testerDependencies: this.testerDependencies.serialize(),
      packageDependencies: this.packageDependencies,
      devPackageDependencies: this.devPackageDependencies,
      peerPackageDependencies: this.peerPackageDependencies,
      compilerPackageDependencies: this.compilerPackageDependencies,
      testerPackageDependencies: this.testerPackageDependencies,
      manuallyRemovedDependencies: this.manuallyRemovedDependencies,
      manuallyAddedDependencies: this.manuallyAddedDependencies,
      overrides: this.overrides.componentOverridesData,
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
      ComponentOutOfSync,
      ExtensionFileNotFound
    ];
    return invalidComponentErrors.some(errorType => err instanceof errorType);
  }

  async toComponentWithDependencies(consumer: Consumer): Promise<ComponentWithDependencies> {
    const getFlatten = (field: string): BitIds => {
      // when loaded from filesystem, it doesn't have the flatten, fetch them from model.
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
      overrides,
      deprecated
    } = object;
    const compilerProps = compiler ? await CompilerExtension.loadFromSerializedModelObject(compiler) : null;
    // $FlowFixMe
    const compilerInstance = compilerProps ? await makeEnv(COMPILER_ENV_TYPE, compilerProps) : null;
    const testerProps = tester ? await TesterExtension.loadFromSerializedModelObject(tester) : null;
    // $FlowFixMe
    const testerInstance = testerProps ? await makeEnv(TESTER_ENV_TYPE, testerProps) : null;
    return new Component({
      name: box ? `${box}/${name}` : name,
      version,
      scope,
      lang,
      bindingPrefix,
      compiler: compilerInstance,
      tester: testerInstance,
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
      overrides: new ComponentOverrides(overrides),
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
    componentFromModel: ?Component
  }): Promise<Component> {
    const consumerPath = consumer.getPath();
    const workspaceConfig: WorkspaceConfig = consumer.config;
    const bitMap: BitMap = consumer.bitMap;
    const deprecated = componentFromModel ? componentFromModel.deprecated : false;
    const componentDir = componentMap.getComponentDir();
    let dists = componentFromModel ? componentFromModel.dists.get() : undefined;
    const mainDistFile = componentFromModel ? componentFromModel.dists.getMainDistFile() : undefined;
    const getLoadedFiles = async (): Promise<SourceFile[]> => {
      const sourceFiles = [];
      await componentMap.trackDirectoryChanges(consumer, id);
      const filesToDelete = [];
      componentMap.files.forEach((file) => {
        const filePath = path.join(bitDir, file.relativePath);
        try {
          const sourceFile = SourceFile.load(filePath, workspaceConfig.distTarget, bitDir, consumerPath, {
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
    let configDir = componentDir ? path.join(consumerPath, componentDir) : consumerPath;
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
    let componentConfig: ?ComponentConfig;
    if (configDir !== consumerPath) {
      // $FlowFixMe unclear error
      componentConfig = await ComponentConfig.load({
        componentDir: componentMap.rootDir,
        workspaceDir: consumerPath,
        configDir,
        workspaceConfig
      });
      // by default, imported components are not written with bit.json file.
      // use the component from the model to get their bit.json values
      if (componentFromModel) {
        componentConfig.mergeWithComponentData(componentFromModel);
      }
    }
    // for authored componentConfig is normally undefined
    const bitJson = componentConfig || workspaceConfig;

    // Remove dists if compiler has been deleted
    if (dists && !bitJson.hasCompiler()) {
      dists = undefined;
    }

    const envsContext = {
      componentDir: bitDir,
      workspaceDir: consumerPath
    };
    const isNotNested = componentMap.origin !== COMPONENT_ORIGINS.NESTED;
    // overrides from consumer-config is not relevant and should not affect imported
    const overridesFromConsumer = isNotNested ? workspaceConfig.overrides.getOverrideComponentData(id) : null;
    const propsToLoadEnvs = {
      consumerPath,
      envType: COMPILER_ENV_TYPE,
      scopePath: consumer.scope.getPath(),
      componentOrigin: componentMap.origin,
      componentFromModel,
      overridesFromConsumer,
      workspaceConfig,
      componentConfig,
      context: envsContext
    };

    const compilerP = EnvExtension.loadFromCorrectSource(propsToLoadEnvs);
    propsToLoadEnvs.envType = TESTER_ENV_TYPE;
    const testerP = EnvExtension.loadFromCorrectSource(propsToLoadEnvs);

    const [compiler, tester] = await Promise.all([compilerP, testerP]);

    // load the compilerPackageDependencies/testerPackageDependencies from the actual compiler/tester
    // if they're not installed, load them from the model
    const compilerDynamicPackageDependencies = compiler && compiler.loaded ? compiler.dynamicPackageDependencies : {};
    const modelCompilerPackageDependencies = componentFromModel
      ? componentFromModel.compilerPackageDependencies || {}
      : {};
    const compilerPackageDependencies = R.isEmpty(compilerDynamicPackageDependencies)
      ? modelCompilerPackageDependencies
      : compilerDynamicPackageDependencies;
    const testerDynamicPackageDependencies = tester && tester.loaded ? tester.dynamicPackageDependencies : {};
    const modelTesterPackageDependencies = componentFromModel ? componentFromModel.testerPackageDependencies || {} : {};
    const testerPackageDependencies = R.isEmpty(testerDynamicPackageDependencies)
      ? modelTesterPackageDependencies
      : testerDynamicPackageDependencies;

    const overridesFromModel = componentFromModel ? componentFromModel.overrides.componentOverridesData : null;
    const isAuthor = componentMap.origin === COMPONENT_ORIGINS.AUTHORED;
    const overrides = ComponentOverrides.loadFromConsumer(
      overridesFromConsumer,
      overridesFromModel,
      componentConfig,
      isAuthor
    );

    const packageJsonFile = (componentConfig && componentConfig.packageJsonFile) || null;
    const packageJsonChangedProps = componentFromModel ? componentFromModel.packageJsonChangedProps : null;
    const files = await getLoadedFiles();
    const docsP = files.map(file => (file.test ? [] : docsParser(file.contents.toString(), file.relative)));
    const docs = await Promise.all(docsP);
    const flattenedDocs = docs ? R.flatten(docs) : [];

    return new Component({
      name: id.name,
      scope: id.scope,
      version: id.version,
      lang: bitJson.lang,
      bindingPrefix: bitJson.bindingPrefix || DEFAULT_BINDINGS_PREFIX,
      compiler,
      tester,
      bitJson: componentConfig,
      mainFile: componentMap.mainFile,
      files,
      loadedFromFileSystem: true,
      componentMap,
      dists,
      docs: flattenedDocs,
      mainDistFile: mainDistFile ? path.normalize(mainDistFile) : null,
      compilerPackageDependencies,
      testerPackageDependencies,
      deprecated,
      origin: componentMap.origin,
      overrides,
      packageJsonFile,
      packageJsonChangedProps
    });
  }
}
