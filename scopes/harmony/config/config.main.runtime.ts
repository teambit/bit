import { getConsumerInfo } from '@teambit/legacy/dist/consumer';
import {
  ExtensionDataEntry,
  ExtensionDataList,
  ILegacyWorkspaceConfig,
  LegacyWorkspaceConfigProps,
} from '@teambit/legacy/dist/consumer/config';
import LegacyWorkspaceConfig, {
  WorkspaceConfigEnsureFunction,
  WorkspaceConfigIsExistFunction,
  WorkspaceConfigLoadFunction,
} from '@teambit/legacy/dist/consumer/config/workspace-config';
import { PathOsBased, PathOsBasedAbsolute } from '@teambit/legacy/dist/utils/path';
import { CLIAspect, MainRuntime, CLIMain } from '@teambit/cli';
import { Slot, SlotRegistry, GlobalConfig } from '@teambit/harmony';
import path from 'path';
import { UseCmd } from './use.cmd';
import {
  LegacyInitProps,
  transformLegacyPropsToExtensions,
  WorkspaceConfig,
  WorkspaceConfigFileProps,
} from './workspace-config';
import { ConfigType, HostConfig } from './types';
import { ConfigAspect } from './config.aspect';

export type SetExtensionOptions = {
  overrideExisting: boolean;
  ignoreVersion: boolean;
};

export type ConfigDeps = [];

export type ConfigConfig = {};

/**
 * pass the aspectIds entered by the user. returns the complete ids including versions.
 */
export type PreAddingAspects = (aspectIds: string[]) => Promise<string[]>;
export type PreAddingAspectsSlot = SlotRegistry<PreAddingAspects>;

export class ConfigMain {
  constructor(
    public workspaceConfig?: WorkspaceConfig,
    public scopeConfig?: WorkspaceConfig,
    public preAddingAspectsSlot?: PreAddingAspectsSlot
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
  ): Promise<ConfigMain> {
    const workspaceConfig = await WorkspaceConfig.ensure(dirPath, workspaceConfigProps, legacyInitProps);
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

  registerPreAddingAspectsSlot(func: PreAddingAspects) {
    this.preAddingAspectsSlot?.register(func);
  }

  static runtime = MainRuntime;
  static slots = [Slot.withType<PreAddingAspects>()];
  static dependencies = [CLIAspect];
  static config = {};
  static async provider([cli]: [CLIMain], config: any, [preAddingAspectsSlot]: [PreAddingAspectsSlot]) {
    LegacyWorkspaceConfig.registerOnWorkspaceConfigIsExist(onLegacyWorkspaceConfigIsExist());
    LegacyWorkspaceConfig.registerOnWorkspaceConfigEnsuring(onLegacyWorkspaceEnsure());
    const consumerInfo = await getConsumerInfo(process.cwd());

    let configMain: ConfigMain | any;
    const configDirPath = consumerInfo?.path || process.cwd();
    const workspaceConfig = await WorkspaceConfig.loadIfExist(configDirPath);
    if (workspaceConfig) {
      configMain = new ConfigMain(workspaceConfig, undefined, preAddingAspectsSlot);
    } else {
      // TODO: try load scope config here
      configMain = {};
    }
    LegacyWorkspaceConfig.registerOnWorkspaceConfigLoading(onLegacyWorkspaceLoad(configMain));
    LegacyWorkspaceConfig.registerOnWorkspaceConfigReset((dirPath, resetHard) =>
      WorkspaceConfig.reset(dirPath, resetHard)
    );
    cli.register(new UseCmd(configMain));
    return configMain;
  }
}

ConfigAspect.addRuntime(ConfigMain);

function onLegacyWorkspaceConfigIsExist(): WorkspaceConfigIsExistFunction {
  return async (dirPath: PathOsBased): Promise<boolean | undefined> => {
    return WorkspaceConfig.isExist(dirPath);
  };
}

function onLegacyWorkspaceLoad(config?: ConfigMain): WorkspaceConfigLoadFunction {
  return async (dirPath: PathOsBased): Promise<ILegacyWorkspaceConfig | undefined> => {
    if (config?.workspaceConfig && config.path && path.normalize(dirPath) === path.dirname(config.path)) {
      return (config.config as WorkspaceConfig).toLegacy();
    }
    const newConfig = await WorkspaceConfig.loadIfExist(dirPath);
    if (newConfig) {
      return newConfig.toLegacy();
    }
    return undefined;
  };
}

function onLegacyWorkspaceEnsure(): WorkspaceConfigEnsureFunction {
  const func: WorkspaceConfigEnsureFunction = async (
    dirPath: string,
    standAlone = false,
    legacyWorkspaceConfigProps?: LegacyWorkspaceConfigProps
  ) => {
    let workspaceConfigProps;
    if (legacyWorkspaceConfigProps) {
      workspaceConfigProps = transformLegacyPropsToExtensions(legacyWorkspaceConfigProps);
    }
    const legacyInitProps: LegacyInitProps = {
      standAlone,
    };
    const config = await ConfigMain.ensureWorkspace(dirPath, workspaceConfigProps, legacyInitProps);
    const workspaceConfig = config.config;
    return (workspaceConfig as WorkspaceConfig).toLegacy();
  };
  return func;
}
