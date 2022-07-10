import fs from 'fs-extra';
import R from 'ramda';

import {
  DEFAULT_COMPONENTS_DIR_PATH,
  DEFAULT_DEPENDENCIES_DIR_PATH,
  DEFAULT_PACKAGE_MANAGER,
  DEFAULT_SAVE_DEPENDENCIES_AS_COMPONENTS,
} from '../../constants';
import logger from '../../logger/logger';
import { isValidPath } from '../../utils';
import filterObject from '../../utils/filter-object';
import { PathOsBased, PathOsBasedAbsolute } from '../../utils/path';
import { ResolveModulesConfig } from '../component/dependencies/files-dependency-builder/types/dependency-tree-type';
import AbstractConfig from './abstract-config';
import ConsumerOverrides from './consumer-overrides';
import { BitConfigNotFound, InvalidBitJson, InvalidPackageJson } from './exceptions';
import InvalidConfigPropPath from './exceptions/invalid-config-prop-path';
import InvalidPackageManager from './exceptions/invalid-package-manager';
import { ExtensionDataList } from './extension-data';
import { ILegacyWorkspaceConfig, PackageManagerClients } from './legacy-workspace-config-interface';

const DEFAULT_USE_WORKSPACES = false;
const DEFAULT_MANAGE_WORKSPACES = true;

export type WorkspaceConfigIsExistFunction = (dirPath: string | PathOsBased) => Promise<boolean | undefined>;

export type WorkspaceConfigLoadFunction = (
  dirPath: string | PathOsBased
) => Promise<ILegacyWorkspaceConfig | undefined>;

export type WorkspaceConfigEnsureFunction = (
  dirPath: PathOsBasedAbsolute,
  standAlone: boolean,
  workspaceConfigProps: WorkspaceConfigProps
) => Promise<ILegacyWorkspaceConfig>;

export type WorkspaceConfigResetFunction = (dirPath: PathOsBasedAbsolute, resetHard: boolean) => Promise<void>;

export type WorkspaceConfigProps = {
  saveDependenciesAsComponents?: boolean;
  lang?: string;
  componentsDefaultDirectory?: string;
  dependenciesDirectory?: string;
  bindingPrefix?: string;
  extensions?: ExtensionDataList;
  packageManager?: PackageManagerClients;
  packageManagerArgs?: string[];
  packageManagerProcessOptions?: Record<string, any>;
  useWorkspaces?: boolean;
  manageWorkspaces?: boolean;
  resolveModules?: ResolveModulesConfig;
  defaultScope?: string;
  overrides?: ConsumerOverrides;
};

export default class WorkspaceConfig extends AbstractConfig {
  componentsDefaultDirectory: string;
  dependenciesDirectory: string;
  saveDependenciesAsComponents: boolean; // save hub dependencies as bit components rather than npm packages
  packageManager: PackageManagerClients;
  packageManagerArgs: string[] | undefined; // package manager client to use
  packageManagerProcessOptions: Record<string, any> | undefined; // package manager process options
  useWorkspaces: boolean; // Enables integration with Yarn Workspaces
  manageWorkspaces: boolean; // manage workspaces with yarn
  resolveModules: ResolveModulesConfig | undefined;
  overrides: ConsumerOverrides;
  packageJsonObject: Record<string, any> | null | undefined; // workspace package.json if exists (parsed)
  defaultScope: string | undefined; // default remote scope to export to

  static workspaceConfigIsExistRegistry: WorkspaceConfigIsExistFunction;
  static registerOnWorkspaceConfigIsExist(func: WorkspaceConfigIsExistFunction) {
    this.workspaceConfigIsExistRegistry = func;
  }

  static workspaceConfigLoadingRegistry: WorkspaceConfigLoadFunction;
  static registerOnWorkspaceConfigLoading(func: WorkspaceConfigLoadFunction) {
    this.workspaceConfigLoadingRegistry = func;
  }
  static workspaceConfigEnsuringRegistry: WorkspaceConfigEnsureFunction;
  static registerOnWorkspaceConfigEnsuring(func: WorkspaceConfigEnsureFunction) {
    this.workspaceConfigEnsuringRegistry = func;
  }
  static workspaceConfigResetRegistry: WorkspaceConfigResetFunction;
  static registerOnWorkspaceConfigReset(func: WorkspaceConfigResetFunction) {
    this.workspaceConfigResetRegistry = func;
  }

  constructor({
    saveDependenciesAsComponents = DEFAULT_SAVE_DEPENDENCIES_AS_COMPONENTS,
    lang,
    componentsDefaultDirectory = DEFAULT_COMPONENTS_DIR_PATH,
    dependenciesDirectory = DEFAULT_DEPENDENCIES_DIR_PATH,
    bindingPrefix,
    extensions,
    packageManager = DEFAULT_PACKAGE_MANAGER,
    packageManagerArgs,
    packageManagerProcessOptions,
    useWorkspaces = DEFAULT_USE_WORKSPACES,
    manageWorkspaces = DEFAULT_MANAGE_WORKSPACES,
    resolveModules,
    defaultScope,
    overrides = ConsumerOverrides.load(),
  }: WorkspaceConfigProps) {
    super({ lang, bindingPrefix, extensions });
    if (packageManager !== 'npm' && packageManager !== 'yarn') {
      throw new InvalidPackageManager(packageManager);
    }
    this.componentsDefaultDirectory = componentsDefaultDirectory;
    // Make sure we have the component name in the path. otherwise components will be imported to the same dir.
    if (!componentsDefaultDirectory.includes('{name}')) {
      this.componentsDefaultDirectory = `${this.componentsDefaultDirectory}/{name}`;
    }
    this.dependenciesDirectory = dependenciesDirectory;
    this.saveDependenciesAsComponents = saveDependenciesAsComponents;
    this.packageManager = packageManager;
    this.packageManagerArgs = packageManagerArgs;
    this.packageManagerProcessOptions = packageManagerProcessOptions;
    this.useWorkspaces = useWorkspaces;
    this.manageWorkspaces = manageWorkspaces;
    this.resolveModules = resolveModules;
    this.defaultScope = defaultScope;
    this.overrides = overrides;
  }

  toPlainObject() {
    const superObject = super.toPlainObject();
    const consumerObject = R.merge(superObject, {
      componentsDefaultDirectory: this.componentsDefaultDirectory,
      dependenciesDirectory: this.dependenciesDirectory,
      saveDependenciesAsComponents: this.saveDependenciesAsComponents,
      packageManager: this.packageManager,
      packageManagerArgs: this.packageManagerArgs,
      packageManagerProcessOptions: this.packageManagerProcessOptions,
      useWorkspaces: this.useWorkspaces,
      manageWorkspaces: this.manageWorkspaces,
      resolveModules: this.resolveModules,
      defaultScope: this.defaultScope,
      overrides: this.overrides.overrides,
    });

    const isPropDefault = (val, key) => {
      if (key === 'dependenciesDirectory') return val !== DEFAULT_DEPENDENCIES_DIR_PATH;
      if (key === 'useWorkspaces') return val !== DEFAULT_USE_WORKSPACES;
      if (key === 'manageWorkspaces') return val !== DEFAULT_MANAGE_WORKSPACES;
      if (key === 'saveDependenciesAsComponents') return val !== DEFAULT_SAVE_DEPENDENCIES_AS_COMPONENTS;
      if (key === 'resolveModules') return !R.isEmpty(val);
      if (key === 'defaultScope') return Boolean(val);
      if (key === 'overrides') return !R.isEmpty(val);
      return true;
    };

    return filterObject(consumerObject, isPropDefault);
  }

  static create(workspaceConfigProps: WorkspaceConfigProps): WorkspaceConfig {
    return new WorkspaceConfig(workspaceConfigProps);
  }

  static async ensure(
    dirPath: PathOsBasedAbsolute,
    standAlone = false,
    workspaceConfigProps: WorkspaceConfigProps = {} as any
  ): Promise<ILegacyWorkspaceConfig> {
    const ensureFunc = this.workspaceConfigEnsuringRegistry;
    return ensureFunc(dirPath, standAlone, workspaceConfigProps);
  }

  static async _ensure(
    workspacePath: PathOsBasedAbsolute,
    standAlone: boolean,
    workspaceConfigProps: WorkspaceConfigProps = {} as any
  ): Promise<WorkspaceConfig> {
    try {
      const workspaceConfig = await this.load(workspacePath);
      return workspaceConfig;
    } catch (err: any) {
      if (err instanceof BitConfigNotFound || err instanceof InvalidBitJson) {
        const consumerBitJson = this.create(workspaceConfigProps);
        const packageJsonExists = await AbstractConfig.pathHasPackageJson(workspacePath);
        if (packageJsonExists && !standAlone) {
          consumerBitJson.writeToPackageJson = true;
        } else {
          consumerBitJson.writeToBitJson = true;
        }
        return consumerBitJson;
      }
      throw err;
    }
  }

  static async reset(dirPath: PathOsBasedAbsolute, resetHard: boolean): Promise<void> {
    const deleteBitJsonFile = async () => {
      const bitJsonPath = AbstractConfig.composeBitJsonPath(dirPath);
      logger.info(`deleting the workspace configuration file at ${bitJsonPath}`);
      await fs.remove(bitJsonPath);
    };
    if (resetHard) {
      await deleteBitJsonFile();
    }
    const resetFunc = this.workspaceConfigResetRegistry;
    await resetFunc(dirPath, resetHard);
    await WorkspaceConfig.ensure(dirPath);
  }

  static fromPlainObject(object: Record<string, any>) {
    this.validate(object);
    const {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      lang,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      componentsDefaultDirectory,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      dependenciesDirectory,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      bindingPrefix,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      extensions,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      saveDependenciesAsComponents,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      packageManager,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      packageManagerArgs,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      packageManagerProcessOptions,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      useWorkspaces,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      manageWorkspaces,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      resolveModules,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      defaultScope,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      overrides,
    } = object;

    return new WorkspaceConfig({
      lang,
      bindingPrefix,
      extensions,
      saveDependenciesAsComponents,
      componentsDefaultDirectory,
      dependenciesDirectory,
      packageManager,
      packageManagerArgs,
      packageManagerProcessOptions,
      useWorkspaces,
      manageWorkspaces,
      resolveModules,
      defaultScope,
      overrides: ConsumerOverrides.load(overrides),
    });
  }

  static async load(dirPath: string): Promise<WorkspaceConfig> {
    const res = await this._loadIfExist(dirPath);
    if (!res) {
      throw new BitConfigNotFound();
    }
    return res;
  }

  static async loadIfExist(dirPath: string | PathOsBased): Promise<ILegacyWorkspaceConfig | undefined> {
    const loadFunc = this.workspaceConfigLoadingRegistry;
    if (loadFunc && typeof loadFunc === 'function') {
      return loadFunc(dirPath);
    }
    return undefined;
  }

  static async isExist(dirPath: string): Promise<boolean | undefined> {
    const isExistFunc = this.workspaceConfigIsExistRegistry;
    if (isExistFunc && typeof isExistFunc === 'function') {
      return isExistFunc(dirPath);
    }
    return undefined;
  }

  static async _isExist(dirPath: string): Promise<boolean> {
    const bitJsonPath = AbstractConfig.composeBitJsonPath(dirPath);
    const packageJsonPath = AbstractConfig.composePackageJsonPath(dirPath);
    const bitJsonExist = await fs.pathExists(bitJsonPath);
    if (bitJsonExist) {
      return true;
    }
    const packageJson = await this.loadPackageJson(packageJsonPath);
    if (packageJson && packageJson.bit) {
      return true;
    }
    return false;
  }

  static async _loadIfExist(dirPath: string): Promise<WorkspaceConfig | undefined> {
    const bitJsonPath = AbstractConfig.composeBitJsonPath(dirPath);
    const packageJsonPath = AbstractConfig.composePackageJsonPath(dirPath);

    const [bitJsonFile, packageJsonFile] = await Promise.all([
      this.loadBitJson(bitJsonPath), // $FlowFixMe
      this.loadPackageJson(packageJsonPath),
    ]);
    const bitJsonConfig = bitJsonFile || {};
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const packageJsonHasConfig = packageJsonFile && packageJsonFile.bit;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const packageJsonConfig = packageJsonHasConfig ? packageJsonFile.bit : {};
    if (R.isEmpty(bitJsonConfig) && R.isEmpty(packageJsonConfig)) return undefined;
    // in case of conflicts, bit.json wins package.json
    const config = Object.assign(packageJsonConfig, bitJsonConfig);
    const workspaceConfig = this.fromPlainObject(config);
    workspaceConfig.path = bitJsonPath;
    workspaceConfig.writeToBitJson = Boolean(bitJsonFile);
    workspaceConfig.writeToPackageJson = packageJsonHasConfig;
    workspaceConfig.packageJsonObject = packageJsonFile;
    return workspaceConfig;
  }

  static async loadBitJson(bitJsonPath: string): Promise<Record<string, any> | null | undefined> {
    try {
      const file = await AbstractConfig.loadJsonFileIfExist(bitJsonPath);
      return file;
    } catch (e: any) {
      throw new InvalidBitJson(bitJsonPath);
    }
  }
  static async loadPackageJson(packageJsonPath: string): Promise<Record<string, any> | null | undefined> {
    try {
      const file = await AbstractConfig.loadJsonFileIfExist(packageJsonPath);
      return file;
    } catch (e: any) {
      throw new InvalidPackageJson(packageJsonPath);
    }
  }

  static validate(object: Record<string, any>) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const { componentsDefaultDirectory, dependenciesDirectory } = object;
    const pathsToValidate = { componentsDefaultDirectory, dependenciesDirectory };
    Object.keys(pathsToValidate).forEach((field) => throwForInvalidPath(field, pathsToValidate[field]));
    function throwForInvalidPath(fieldName, pathToValidate): void {
      if (pathToValidate && !isValidPath(pathToValidate)) {
        throw new InvalidConfigPropPath(fieldName, pathToValidate);
      }
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    ConsumerOverrides.validate(object.overrides);
  }
}
