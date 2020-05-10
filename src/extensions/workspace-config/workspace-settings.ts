import { omit } from 'ramda';
import { LegacyWorkspaceConfig, ILegacyWorkspaceSettings } from '../../consumer/config';
import GeneralError from '../../error/general-error';
import { ExtensionConfigList, ExtensionConfigEntry } from '../../consumer/config/extension-config-list';
import { ResolveModulesConfig } from '../../consumer/component/dependencies/files-dependency-builder/types/dependency-tree-type';

const LEGACY_PROPS = [
  'dependenciesDirectory',
  'bindingPrefix',
  'resolveModules',
  'saveDependenciesAsComponents',
  'distEntry',
  'distTarget'
];

export type ComponentScopeDirMapEntry = {
  defaultScope?: string;
  directory: string;
};

export type ComponentScopeDirMap = Array<ComponentScopeDirMapEntry>;

export type WorkspaceExtensionProps = {
  defaultOwner?: string;
  defaultScope?: string;
  defaultDirectory?: string;
  components?: ComponentScopeDirMap;
};

export type PackageManagerClients = 'librarian' | 'npm' | 'yarn' | undefined;

export interface DependencyResolverExtensionProps {
  packageManager: PackageManagerClients;
  strictPeerDependencies?: boolean;
  extraArgs?: string[];
  packageManagerProcessOptions?: any;
  useWorkspaces?: boolean;
  manageWorkspaces?: boolean;
}

export type WorkspaceSettingsNewProps = {
  workspace: WorkspaceExtensionProps;
  dependencyResolver: DependencyResolverExtensionProps;
};

export type WorkspaceSettingsLegacyProps = {
  dependenciesDirectory?: string;
  bindingPrefix?: string;
  resolveModules?: ResolveModulesConfig;
  saveDependenciesAsComponents?: boolean;
  distEntry?: string;
  distTarget?: string;
};

export type WorkspaceSettingsProps = WorkspaceSettingsNewProps & WorkspaceSettingsLegacyProps;

export class WorkspaceSettings implements ILegacyWorkspaceSettings {
  constructor(private data: WorkspaceSettingsProps) {}

  get componentsDefaultDirectory() {
    // TODO: change when supporting many dirs<>scopes mapping
    return this.data.workspace.defaultDirectory;
  }

  get defaultScope(): string | undefined {
    // TODO: change when supporting many dirs<>scopes mapping
    const defaultOwner = this.defaultOwner;
    const defaultOwnerPrefix = `${defaultOwner}.`;
    // For legacy workspace where the default scope contain the owner
    if (defaultOwner && this.data.workspace.defaultScope?.startsWith(defaultOwner)) {
      return this.data.workspace.defaultScope.replace(defaultOwnerPrefix, '');
    }
    return this.data.workspace.defaultScope;
  }

  set defaultScope(defaultScope: string | undefined) {
    if (defaultScope) {
      // TODO: change when supporting many dirs<>scopes mapping
      this.data.workspace.defaultScope = defaultScope;
    }
  }

  get dependencyResolver() {
    return this.data.dependencyResolver;
  }

  get packageManager() {
    return this.data.dependencyResolver.packageManager;
  }

  get defaultOwner() {
    return this.data.workspace.defaultOwner;
  }

  _setPackageManager(clientName: PackageManagerClients) {
    this.data.dependencyResolver.packageManager = clientName;
  }

  get _useWorkspaces() {
    return this.data.dependencyResolver.useWorkspaces;
  }

  get _manageWorkspaces() {
    return this.data.dependencyResolver.manageWorkspaces;
  }

  get _bindingPrefix() {
    return this.data.workspace.defaultOwner;
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

  get extensionsConfig(): ExtensionConfigList {
    // const workspaceExtProps = pick(WORKSPACE_EXT_PROPS, this.data);
    // TODO: take name from the extension
    // const workspaceExtEntry = { id: 'workspace', config: workspaceExtProps };
    // const otherExtensionsProps = omit(WORKSPACE_EXT_PROPS, this.data);
    const withoutLegacyProps = omit(LEGACY_PROPS, this.data);
    const res = ExtensionConfigList.fromObject(withoutLegacyProps);
    // res.push(workspaceExtEntry);
    return res;
  }

  getExtensionConfig(extensionId: string): { [key: string]: any } | undefined {
    const existing = this.extensionsConfig.findExtension(extensionId, true);
    return existing?.config;
  }

  /**
   * Update the extension version, keeping the old extension config
   *
   * @param {BitId} newExtensionId
   * @memberof WorkspaceSettings
   */
  updateExtensionVersion(newExtensionId: string) {
    const existing = this.extensionsConfig.findExtension(newExtensionId, true);
    if (!existing) {
      throw new GeneralError(`extension ${newExtensionId} not found in workspace config`);
    }
    this.data[newExtensionId] = existing.config;
    delete this.data[existing.id];
  }

  addExtension(extensionEntry: ExtensionConfigEntry, override = false) {
    const existing = this.extensionsConfig.findExtension(extensionEntry.id, true);
    if (existing) {
      if (!override) {
        throw new GeneralError(`extension ${extensionEntry.id} already exist in workspace config`);
      }
      delete this.data[existing.id];
    }
    this.data[extensionEntry.id] = extensionEntry.config || {};
  }

  /**
   * Create an instance of the WorkspaceConfig by an instance of the legacy config
   *
   * @static
   * @param {*} legacyConfig
   * @returns
   * @memberof WorkspaceConfig
   */
  static fromLegacyConfig(legacyConfig: LegacyWorkspaceConfig) {
    const data = {
      workspace: {
        defaultScope: legacyConfig.defaultScope,
        defaultDirectory: legacyConfig.componentsDefaultDirectory,
        defaultOwner: legacyConfig.bindingPrefix
      },
      dependencyResolver: {
        packageManager: legacyConfig.packageManager,
        strictPeerDependnecies: false,
        extraArgs: legacyConfig.packageManagerArgs,
        packageManagerProcessOptions: legacyConfig.packageManagerProcessOptions,
        manageWorkspaces: legacyConfig.manageWorkspaces,
        useWorkspaces: legacyConfig.useWorkspaces
      },
      dependenciesDirectory: legacyConfig.dependenciesDirectory,
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
