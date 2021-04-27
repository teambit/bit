import { getConsumerInfo } from '@teambit/legacy/dist/consumer';
import { ILegacyWorkspaceConfig, LegacyWorkspaceConfigProps } from '@teambit/legacy/dist/consumer/config';
import { InvalidBitJson } from '@teambit/legacy/dist/consumer/config/exceptions';
import LegacyWorkspaceConfig, {
  WorkspaceConfigEnsureFunction,
  WorkspaceConfigIsExistFunction,
  WorkspaceConfigLoadFunction,
} from '@teambit/legacy/dist/consumer/config/workspace-config';
import { PathOsBased } from '@teambit/legacy/dist/utils/path';
import path from 'path';

import { Config } from './config';
import InvalidConfigFile from './exceptions/invalid-config-file';
import { LegacyInitProps, transformLegacyPropsToExtensions, WorkspaceConfig } from './workspace-config';

export type ConfigDeps = [];

export type ConfigConfig = {};

export default async function provideConfig() {
  LegacyWorkspaceConfig.registerOnWorkspaceConfigIsExist(onLegacyWorkspaceConfigIsExist());
  LegacyWorkspaceConfig.registerOnWorkspaceConfigEnsuring(onLegacyWorkspaceEnsure());
  const consumerInfo = await getConsumerInfo(process.cwd());
  const config: Config = await tryToGetConfig(consumerInfo?.path || process.cwd());
  LegacyWorkspaceConfig.registerOnWorkspaceConfigLoading(onLegacyWorkspaceLoad(config));
  return config;
}

// This is used to handle cases where the user run bit init --reset / --reset-hard
// during this time we don't yet know if the user ask for init reset so we catch it here
// other places should handle cases when there is no config
// TODO: change the {} to some maybe type
async function tryToGetConfig(dirPath: string): Promise<Config | any> {
  try {
    const config: Config = await Config.loadIfExist(dirPath);
    return config;
  } catch (err) {
    if (!(err instanceof InvalidBitJson) && !(err instanceof InvalidConfigFile)) {
      throw err;
    }
    return {};
  }
}

function onLegacyWorkspaceConfigIsExist(): WorkspaceConfigIsExistFunction {
  return async (dirPath: PathOsBased): Promise<boolean | undefined> => {
    return WorkspaceConfig.isExist(dirPath);
  };
}

function onLegacyWorkspaceLoad(config?: Config): WorkspaceConfigLoadFunction {
  return async (dirPath: PathOsBased): Promise<ILegacyWorkspaceConfig | undefined> => {
    if (config?.workspaceConfig && config.path && path.normalize(dirPath) === path.dirname(config.path)) {
      return (config.config as WorkspaceConfig).toLegacy();
    }
    const newConfig = await Config.loadIfExist(dirPath);
    if (newConfig && newConfig.type === 'workspace') {
      return (newConfig.config as WorkspaceConfig).toLegacy();
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
    const config = await Config.ensureWorkspace(dirPath, workspaceConfigProps, legacyInitProps);
    const workspaceConfig = config.config;
    return (workspaceConfig as WorkspaceConfig).toLegacy();
  };
  return func;
}
