import { pickBy } from 'lodash';
import R from 'ramda';
import {
  DEFAULT_COMPONENTS_DIR_PATH,
  DEFAULT_DEPENDENCIES_DIR_PATH,
  DEFAULT_PACKAGE_MANAGER,
  DEFAULT_SAVE_DEPENDENCIES_AS_COMPONENTS,
} from '../../constants';
import { PathOsBased, PathOsBasedAbsolute } from '../../utils/path';
import AbstractConfig from './abstract-config';
import ConsumerOverrides from './consumer-overrides';
import { InvalidPackageJson } from './exceptions';
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
  extensions?: ExtensionDataList;
  packageManager?: PackageManagerClients;
  packageManagerArgs?: string[];
  packageManagerProcessOptions?: Record<string, any>;
  useWorkspaces?: boolean;
  manageWorkspaces?: boolean;
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
    extensions,
    packageManager = DEFAULT_PACKAGE_MANAGER,
    packageManagerArgs,
    packageManagerProcessOptions,
    useWorkspaces = DEFAULT_USE_WORKSPACES,
    manageWorkspaces = DEFAULT_MANAGE_WORKSPACES,
    defaultScope,
    overrides = ConsumerOverrides.load(),
  }: WorkspaceConfigProps) {
    super({ lang, extensions });
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
    this.defaultScope = defaultScope;
    this.overrides = overrides;
  }

  toPlainObject() {
    const superObject = super.toPlainObject();
    const consumerObject = {
      ...superObject,
      componentsDefaultDirectory: this.componentsDefaultDirectory,
      dependenciesDirectory: this.dependenciesDirectory,
      saveDependenciesAsComponents: this.saveDependenciesAsComponents,
      packageManager: this.packageManager,
      packageManagerArgs: this.packageManagerArgs,
      packageManagerProcessOptions: this.packageManagerProcessOptions,
      useWorkspaces: this.useWorkspaces,
      manageWorkspaces: this.manageWorkspaces,
      defaultScope: this.defaultScope,
      overrides: this.overrides.overrides,
    };

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

    return pickBy(consumerObject, isPropDefault);
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

  static async reset(dirPath: PathOsBasedAbsolute, resetHard: boolean): Promise<void> {
    const resetFunc = this.workspaceConfigResetRegistry;
    await resetFunc(dirPath, resetHard);
    await WorkspaceConfig.ensure(dirPath);
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
    const packageJsonPath = AbstractConfig.composePackageJsonPath(dirPath);
    const packageJson = await this.loadPackageJson(packageJsonPath);
    if (packageJson && packageJson.bit) {
      return true;
    }
    return false;
  }

  static async loadPackageJson(packageJsonPath: string): Promise<Record<string, any> | null | undefined> {
    try {
      const file = await AbstractConfig.loadJsonFileIfExist(packageJsonPath);
      return file;
    } catch (e: any) {
      throw new InvalidPackageJson(packageJsonPath);
    }
  }
}
