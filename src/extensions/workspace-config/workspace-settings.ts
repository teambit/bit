import { ResolveModulesConfig } from '../../consumer/component/dependencies/dependency-resolver/types/dependency-tree-type';
// TODO: get the types in a better way
import { PMConfig } from '../package-manager';

export interface WorkspaceSettingsProps {
  componentsDefaultDirectory?: string;
  dependenciesDirectory?: string;
  defaultScope?: string;
  saveDependenciesAsComponents?: boolean;
  resolveModules?: ResolveModulesConfig;
  packageManager: PMConfig;
  useWorkspaces?: boolean;
  manageWorkspaces?: boolean;
  bindingPrefix?: string;
  distEntry?: string | undefined;
  distTarget?: string | undefined;
}

export class WorkspaceSettings {
  constructor(private data: WorkspaceSettingsProps) {}

  get componentsDefaultDirectory() {
    return this.data.componentsDefaultDirectory;
  }

  get defaultScope(): string | undefined {
    return this.data.defaultScope;
  }

  set defaultScope(defaultScope: string | undefined) {
    this.data.defaultScope = defaultScope;
  }

  get packageManager() {
    return this.data.packageManager;
  }

  get _useWorkspaces() {
    return this.data.useWorkspaces;
  }

  get _manageWorkspaces() {
    return this.data.manageWorkspaces;
  }

  get _bindingPrefix() {
    return this.data.bindingPrefix;
  }

  get _dependenciesDirectory() {
    return this.data.dependenciesDirectory;
  }

  get _resolveModules() {
    return this.data.resolveModules;
  }

  get _saveDependenciesAsComponents() {
    return this.data.saveDependenciesAsComponents;
  }

  get _distEntry() {
    return this.data.distEntry;
  }

  get _distTarget() {
    return this.data.distTarget;
  }

  /**
   * Create an instance of the WorkspaceConfig by an instance of the legacy config
   *
   * @static
   * @param {*} legacyConfig
   * @returns
   * @memberof WorkspaceConfig
   */
  static fromLegacyConfig(legacyConfig) {
    const data = {
      defaultScope: legacyConfig.defaultScope,
      componentsDefaultDirectory: legacyConfig.componentsDefaultDirectory,
      dependenciesDirectory: legacyConfig.dependenciesDirectory,
      packageManager: {
        packageManager: legacyConfig.packageManager,
        packageManagerArgs: legacyConfig.packageManagerArgs,
        packageManagerProcessOptions: legacyConfig.packageManagerProcessOptions
      },
      bindingPrefix: legacyConfig.bindingPrefix,
      useWorkspaces: legacyConfig.useWorkspaces,
      manageWorkspaces: legacyConfig.manageWorkspaces,
      resolveModules: legacyConfig.resolveModules,
      saveDependenciesAsComponents: legacyConfig.saveDependenciesAsComponents,
      distEntry: legacyConfig.distEntry,
      distTarget: legacyConfig.distTarget
    };
    return this.fromObject(data);
  }

  /**
   * Create an instance of the WorkspaceConfig by data
   *
   * @static
   * @param {WorkspaceSettingsProps} data
   * @returns
   * @memberof WorkspaceConfig
   */
  static fromObject(data: WorkspaceSettingsProps) {
    return new WorkspaceSettings(data);
  }
}
