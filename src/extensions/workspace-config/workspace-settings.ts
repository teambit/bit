import { omit, pick, find, forEachObjIndexed } from 'ramda';
import { ResolveModulesConfig } from '../../consumer/component/dependencies/dependency-resolver/types/dependency-tree-type';
// TODO: get the types in a better way
import { PMConfig } from '../package-manager';
import { BitId } from '../../bit-id';
import GeneralError from '../../error/general-error';

// TODO: consider moving to workspace extension
const WORKSPACE_EXT_PROPS = [
  'componentsDefaultDirectory',
  'defaultScope',
  'dependenciesDirectory',
  'saveDependenciesAsComponents',
  'useWorkspaces',
  'manageWorkspaces',
  'bindingPrefix',
  'distEntry',
  'distTarget'
];
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

interface ExtensionConfigEntry {
  id: string;
  config: any;
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

  get extensionsConfig(): ExtensionConfigEntry[] {
    const workspaceExtProps = pick(WORKSPACE_EXT_PROPS, this.data);
    // TODO: take name from the extension
    const workspaceExtEntry = { id: 'workspace', config: workspaceExtProps };
    const otherExtensionsProps = omit(WORKSPACE_EXT_PROPS, this.data);
    const otherExtensions = forEachObjIndexed((config, id) => {
      return { id, config };
    }, otherExtensionsProps);
    return [workspaceExtEntry, ...otherExtensions];
  }

  findExtension(extensionId: string, ignoreVersion = false): ExtensionConfigEntry | undefined {
    return find((extEntry: ExtensionConfigEntry) => {
      if (!ignoreVersion) {
        return extEntry.id === extensionId;
      }
      return BitId.getStringWithoutVersion(extEntry.id) === BitId.getStringWithoutVersion(extensionId);
    }, this.extensionsConfig);
  }

  /**
   * Update the extension version, keeping the old extension config
   *
   * @param {BitId} newExtensionId
   * @memberof WorkspaceSettings
   */
  updateExtensionVersion(newExtensionId: string) {
    const existing = this.findExtension(newExtensionId, true);
    if (!existing) {
      throw new GeneralError(`exntesion ${newExtensionId} not found in workspace config`);
    }
    this.data[newExtensionId] = existing.config;
    delete this.data[existing.id];
  }

  addExtension(extensionEntry: ExtensionConfigEntry, override = false) {
    const existing = this.findExtension(extensionEntry.id, true);
    if (existing) {
      if (!override) {
        throw new GeneralError(`exntesion ${extensionEntry.id} already exist in workspace config`);
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
