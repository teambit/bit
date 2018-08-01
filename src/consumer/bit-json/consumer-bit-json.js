/** @flow */
import fs from 'fs-extra';
import R from 'ramda';
import AbstractBitJson from './abstract-bit-json';
import type { Extensions, Compilers, Testers } from './abstract-bit-json';
import { BitJsonNotFound, InvalidBitJson } from './exceptions';
import {
  DEFAULT_COMPONENTS_DIR_PATH,
  DEFAULT_DEPENDENCIES_DIR_PATH,
  DEFAULT_EJECTED_ENVS_DIR_PATH,
  DEFAULT_PACKAGE_MANAGER
} from '../../constants';
import filterObject from '../../utils/filter-object';
import type { ResolveModulesConfig } from '../component/dependencies/dependency-resolver/types/dependency-tree-type';
import type { PathOsBasedAbsolute } from '../../utils/path';
import logger from '../../logger/logger';

const DEFAULT_USE_WORKSPACES = false;
const DEFAULT_MANAGE_WORKSPACES = true;
const DEFAULT_SAVE_DEPENDENCIES_AS_COMPONENTS = false;

type consumerBitJsonProps = {
  compiler?: string | Compilers,
  tester?: string | Testers,
  dependencies?: { [string]: string },
  saveDependenciesAsComponents?: boolean,
  lang?: string,
  distTarget?: ?string,
  distEntry?: ?string,
  componentsDefaultDirectory?: string,
  dependenciesDirectory?: string,
  ejectedEnvsDirectory?: string,
  bindingPrefix?: string,
  extensions?: Extensions,
  packageManager?: 'npm' | 'yarn',
  packageManagerArgs?: string[],
  packageManagerProcessOptions?: Object,
  useWorkspaces?: boolean,
  manageWorkspaces?: boolean,
  resolveModules?: ResolveModulesConfig
};

export default class ConsumerBitJson extends AbstractBitJson {
  distTarget: ?string; // path where to store build artifacts
  // path to remove while storing build artifacts. If, for example the code is in 'src' directory, and the component
  // is-string is in src/components/is-string, the dists files will be in dists/component/is-string (without the 'src')
  distEntry: ?string;
  componentsDefaultDirectory: string;
  dependenciesDirectory: string;
  ejectedEnvsDirectory: string;
  saveDependenciesAsComponents: boolean; // save hub dependencies as bit components rather than npm packages
  packageManager: 'npm' | 'yarn'; // package manager client to use
  packageManagerArgs: ?(string[]); // package manager client to use
  packageManagerProcessOptions: ?Object; // package manager process options
  useWorkspaces: boolean; // Enables integration with Yarn Workspaces
  manageWorkspaces: boolean; // manage workspaces with yarn
  resolveModules: ?ResolveModulesConfig;

  constructor({
    compiler,
    tester,
    dependencies,
    saveDependenciesAsComponents = DEFAULT_SAVE_DEPENDENCIES_AS_COMPONENTS,
    lang,
    distTarget,
    distEntry,
    componentsDefaultDirectory = DEFAULT_COMPONENTS_DIR_PATH,
    dependenciesDirectory = DEFAULT_DEPENDENCIES_DIR_PATH,
    ejectedEnvsDirectory = DEFAULT_EJECTED_ENVS_DIR_PATH,
    bindingPrefix,
    extensions,
    packageManager = DEFAULT_PACKAGE_MANAGER,
    packageManagerArgs,
    packageManagerProcessOptions,
    useWorkspaces = DEFAULT_USE_WORKSPACES,
    manageWorkspaces = DEFAULT_MANAGE_WORKSPACES,
    resolveModules
  }: consumerBitJsonProps) {
    super({ compiler, tester, dependencies, lang, bindingPrefix, extensions });
    this.distTarget = distTarget;
    this.distEntry = distEntry;
    this.componentsDefaultDirectory = componentsDefaultDirectory;
    this.dependenciesDirectory = dependenciesDirectory;
    this.ejectedEnvsDirectory = ejectedEnvsDirectory;
    this.saveDependenciesAsComponents = saveDependenciesAsComponents;
    this.packageManager = packageManager;
    this.packageManagerArgs = packageManagerArgs;
    this.packageManagerProcessOptions = packageManagerProcessOptions;
    this.useWorkspaces = useWorkspaces;
    this.manageWorkspaces = manageWorkspaces;
    this.resolveModules = resolveModules;
  }

  toPlainObject() {
    const superObject = super.toPlainObject();
    let consumerObject = R.merge(superObject, {
      componentsDefaultDirectory: this.componentsDefaultDirectory,
      dependenciesDirectory: this.dependenciesDirectory,
      ejectedEnvsDirectory: this.ejectedEnvsDirectory,
      saveDependenciesAsComponents: this.saveDependenciesAsComponents,
      packageManager: this.packageManager,
      packageManagerArgs: this.packageManagerArgs,
      packageManagerProcessOptions: this.packageManagerProcessOptions,
      useWorkspaces: this.useWorkspaces,
      manageWorkspaces: this.manageWorkspaces,
      resolveModules: this.resolveModules
    });
    if (this.distEntry || this.distTarget) {
      const dist = {};
      if (this.distEntry) dist.entry = this.distEntry;
      if (this.distTarget) dist.target = this.distTarget;
      consumerObject = R.merge(consumerObject, { dist });
    }

    const isPropDefault = (val, key) => {
      if (key === 'dependenciesDirectory') return val !== DEFAULT_DEPENDENCIES_DIR_PATH;
      if (key === 'ejectedEnvsDirectory') return val !== DEFAULT_EJECTED_ENVS_DIR_PATH;
      if (key === 'useWorkspaces') return val !== DEFAULT_USE_WORKSPACES;
      if (key === 'manageWorkspaces') return val !== DEFAULT_MANAGE_WORKSPACES;
      if (key === 'saveDependenciesAsComponents') return val !== DEFAULT_SAVE_DEPENDENCIES_AS_COMPONENTS;
      if (key === 'resolveModules') return !R.isEmpty(val);
      return true;
    };

    return filterObject(consumerObject, isPropDefault);
  }

  static create(): ConsumerBitJson {
    return new ConsumerBitJson({});
  }

  static async ensure(dirPath: PathOsBasedAbsolute): Promise<ConsumerBitJson> {
    try {
      const consumerBitJson = await this.load(dirPath);
      return consumerBitJson;
    } catch (err) {
      return this.create();
    }
  }

  static async reset(dirPath: PathOsBasedAbsolute, resetHard: boolean): Promise<void> {
    const deleteBitJsonFile = async () => {
      const bitJsonPath = AbstractBitJson.composePath(dirPath);
      logger.info(`deleting the consumer bit.json file at ${bitJsonPath}`);
      await fs.remove(bitJsonPath);
    };
    if (resetHard) await deleteBitJsonFile();
  }

  static fromPlainObject(object: Object) {
    const {
      sources,
      env,
      dependencies,
      lang,
      componentsDefaultDirectory,
      dependenciesDirectory,
      ejectedEnvsDirectory,
      dist,
      bindingPrefix,
      extensions,
      saveDependenciesAsComponents,
      packageManager,
      packageManagerArgs,
      packageManagerProcessOptions,
      useWorkspaces,
      manageWorkspaces,
      resolveModules
    } = object;

    return new ConsumerBitJson({
      compiler: R.propOr(undefined, 'compiler', env),
      tester: R.propOr(undefined, 'tester', env),
      lang,
      bindingPrefix,
      extensions,
      dependencies,
      saveDependenciesAsComponents,
      componentsDefaultDirectory,
      dependenciesDirectory,
      ejectedEnvsDirectory,
      packageManager,
      packageManagerArgs,
      packageManagerProcessOptions,
      useWorkspaces,
      manageWorkspaces,
      resolveModules,
      distTarget: R.propOr(undefined, 'target', dist),
      distEntry: R.propOr(undefined, 'entry', dist)
    });
  }

  static async load(dirPath: string): Promise<ConsumerBitJson> {
    const isExisting = await AbstractBitJson.hasExisting(dirPath);
    if (!isExisting) throw new BitJsonNotFound();
    const bitJsonPath = AbstractBitJson.composePath(dirPath);
    try {
      const file = await fs.readJson(bitJsonPath);
      const consumerBitJson = this.fromPlainObject(file);
      consumerBitJson.path = bitJsonPath;
      return consumerBitJson;
    } catch (e) {
      throw new InvalidBitJson(bitJsonPath);
    }
  }
}
