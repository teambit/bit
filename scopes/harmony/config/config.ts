import { GlobalConfig } from '@teambit/harmony';
import { ExtensionDataEntry, ExtensionDataList } from '@teambit/legacy/dist/consumer/config';
import { PathOsBased, PathOsBasedAbsolute } from '@teambit/legacy/dist/utils/path';

import { ConfigType, HostConfig } from './types';
import { LegacyInitProps, WorkspaceConfig, WorkspaceConfigFileProps } from './workspace-config';

// export type ConfigProps = {
//   workspaceConfig: WorkspaceConfig;
// } | {
//   scopeConfig: WorkspaceConfig;
// };

export type SetExtensionOptions = {
  overrideExisting: boolean;
  ignoreVersion: boolean;
};

export class Config {
  constructor(public workspaceConfig?: WorkspaceConfig, public scopeConfig?: WorkspaceConfig) {}
  // constructor(private props: ConfigProps) {}

  get type(): ConfigType {
    if (this.workspaceConfig) {
      return 'workspace';
    }
    return 'scope';
  }

  get path(): PathOsBased | undefined {
    return this.config?.path;
  }

  get config(): HostConfig | undefined {
    if (this.workspaceConfig) {
      return this.workspaceConfig;
    }
    return this.scopeConfig;
  }

  static async loadIfExist(dirPath: PathOsBased): Promise<Config | undefined | any> {
    const workspaceConfig = await WorkspaceConfig.loadIfExist(dirPath);
    if (workspaceConfig) {
      return new Config(workspaceConfig);
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
    return new Config(workspaceConfig);
  }

  get extensions(): ExtensionDataList | undefined {
    return this.config?.extensions;
  }

  extension(extensionId: string, ignoreVersion: boolean): ExtensionDataEntry | undefined {
    return this.config?.extension(extensionId, ignoreVersion);
  }

  setExtension(extensionId: string, config: Record<string, any>, options: SetExtensionOptions) {
    this.config?.setExtension(extensionId, config, options);
  }

  getHarmonyConfigObject(): GlobalConfig {
    const config = {};
    if (!this.extensions) return config;
    this.extensions.forEach((extension) => {
      config[extension.stringId] = extension.config;
    });
    return config;
  }
}
