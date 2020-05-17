import { ConfigType, HostConfig } from './types';
import { PathOsBased, PathOsBasedAbsolute } from '../../utils/path';
import { WorkspaceConfig, WorkspaceConfigFileProps, LegacyInitProps } from './workspace-config';
import { ExtensionConfigList, ExtensionConfigEntry } from '../../consumer/config';

export class Config {
  constructor(public config: HostConfig, private configType: ConfigType) {}

  get type() {
    return this.configType;
  }

  get path() {
    return this.config.path;
  }

  static async loadIfExist(dirPath: PathOsBased): Promise<Config | undefined | any> {
    const workspaceConfig = await WorkspaceConfig.loadIfExist(dirPath);
    if (workspaceConfig) {
      return new Config(workspaceConfig, 'workspace');
    }
    // TODO: try load scope config here
    // return undefined;
    // TODO: change to return a maybe type
    return {};
    // return new Config(workspaceConfig, 'workspace');
  }

  /**
   * Ensure the given directory has a workspace config
   * Load if existing and create new if not
   *
   * @static
   * @param {PathOsBasedAbsolute} dirPath
   * @param {WorkspaceConfigFileProps} [workspaceConfigProps={} as any]
   * @returns {Promise<WorkspaceConfig>}
   * @memberof WorkspaceConfig
   */
  static async ensureWorkspace(
    dirPath: PathOsBasedAbsolute,
    workspaceConfigProps: WorkspaceConfigFileProps = {} as any,
    legacyInitProps?: LegacyInitProps
  ): Promise<Config> {
    const workspaceConfig = await WorkspaceConfig.ensure(dirPath, workspaceConfigProps, legacyInitProps);
    return new Config(workspaceConfig, 'workspace');
  }

  get extensions(): ExtensionConfigList {
    return this.config.extensions;
  }

  extension(extensionId: string, ignoreVersion: boolean): ExtensionConfigEntry {
    return this.config.extension(extensionId, ignoreVersion);
  }
}
