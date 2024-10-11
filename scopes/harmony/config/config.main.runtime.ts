import { getConsumerInfo } from '@teambit/legacy/dist/consumer';
import { ExtensionDataEntry, ExtensionDataList, ILegacyWorkspaceConfig } from '@teambit/legacy/dist/consumer/config';
import LegacyWorkspaceConfig, {
  WorkspaceConfigLoadFunction,
} from '@teambit/legacy/dist/consumer/config/workspace-config';
import { PathOsBased, PathOsBasedAbsolute } from '@teambit/legacy.utils';
import { findScopePath } from '@teambit/scope.modules.find-scope-path';
import { MainRuntime } from '@teambit/cli';
import { GlobalConfig, Harmony } from '@teambit/harmony';
import path from 'path';
import { WorkspaceConfig, WorkspaceConfigFileProps, WorkspaceExtensionProps } from './workspace-config';
import { ConfigType, HostConfig } from './types';
import { ConfigAspect } from './config.aspect';

export type SetExtensionOptions = {
  overrideExisting?: boolean;
  ignoreVersion: boolean;
  mergeIntoExisting?: boolean;
};

export type ConfigDeps = [];

export type ConfigConfig = {};

export class ConfigMain {
  constructor(
    public workspaceConfig?: WorkspaceConfig,
    public scopeConfig?: WorkspaceConfig
  ) {}

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

  async reloadWorkspaceConfig(cwd: string) {
    const workspaceConfig = await loadWorkspaceConfigIfExist(cwd);
    if (workspaceConfig) this.workspaceConfig = workspaceConfig;
  }

  /**
   * Ensure the given directory has a workspace config
   * Load if existing and create new if not
   *
   * @static
   * @param {PathOsBasedAbsolute} workspacePath
   * @param {WorkspaceConfigFileProps} [workspaceConfigProps={} as any]
   * @returns {Promise<WorkspaceConfig>}
   * @memberof WorkspaceConfig
   */
  static async ensureWorkspace(
    workspacePath: PathOsBasedAbsolute,
    scopePath: PathOsBasedAbsolute,
    workspaceConfigProps: WorkspaceConfigFileProps = {} as any,
    generator?: string
  ): Promise<ConfigMain> {
    const workspaceConfig = await WorkspaceConfig.ensure(workspacePath, scopePath, workspaceConfigProps, generator);
    return new ConfigMain(workspaceConfig);
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

  static async workspaceEnsureLegacy(
    workspacePath: string,
    scopePath: string,
    workspaceExtensionProps?: WorkspaceExtensionProps,
    generator?: string
  ) {
    let workspaceConfigProps;
    if (workspaceExtensionProps) {
      workspaceConfigProps = { 'teambit.workspace/workspace': workspaceExtensionProps };
    }
    const config = await ConfigMain.ensureWorkspace(workspacePath, scopePath, workspaceConfigProps, generator);
    const workspaceConfig = config.config;
    return (workspaceConfig as WorkspaceConfig).toLegacy();
  }

  static runtime = MainRuntime;
  static slots = [];
  static dependencies = [];
  static config = {};
  static async provider(_deps, _config, _slots, harmony: Harmony) {
    // LegacyWorkspaceConfig.registerOnWorkspaceConfigEnsuring(onLegacyWorkspaceEnsure());

    let configMain: ConfigMain | any;
    const bitConfig = harmony.config.raw.get('teambit.harmony/bit') as any;
    const workspaceConfig = await loadWorkspaceConfigIfExist(bitConfig?.cwd);
    if (workspaceConfig) {
      configMain = new ConfigMain(workspaceConfig, undefined);
    } else {
      // TODO: try load scope config here
      configMain = {};
    }
    LegacyWorkspaceConfig.registerOnWorkspaceConfigLoading(onLegacyWorkspaceLoad(configMain));
    return configMain;
  }
}

ConfigAspect.addRuntime(ConfigMain);

async function loadWorkspaceConfigIfExist(cwd = process.cwd()): Promise<WorkspaceConfig | undefined> {
  const consumerInfo = await getConsumerInfo(cwd);
  const configDirPath = consumerInfo?.path || cwd;
  const scopePath = findScopePath(configDirPath);
  const workspaceConfig = await WorkspaceConfig.loadIfExist(configDirPath, scopePath);
  return workspaceConfig;
}

function onLegacyWorkspaceLoad(config?: ConfigMain): WorkspaceConfigLoadFunction {
  return async (dirPath: PathOsBased, scopePath: PathOsBasedAbsolute): Promise<ILegacyWorkspaceConfig | undefined> => {
    if (config?.workspaceConfig && config.path && path.normalize(dirPath) === path.dirname(config.path)) {
      return (config.config as WorkspaceConfig).toLegacy();
    }
    const newConfig = await WorkspaceConfig.loadIfExist(dirPath, scopePath);
    if (newConfig) {
      return newConfig.toLegacy();
    }
    return undefined;
  };
}
