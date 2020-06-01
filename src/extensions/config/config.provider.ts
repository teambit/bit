import path from 'path';
import { Harmony } from '@teambit/harmony';
import LegacyWorkspaceConfig, {
  WorkspaceConfigEnsureFunction,
  WorkspaceConfigLoadFunction,
  WorkspaceConfigIsExistFunction
} from '../../consumer/config/workspace-config';
import { Config } from './config';
import { ILegacyWorkspaceConfig, LegacyWorkspaceConfigProps } from '../../consumer/config';
import { getConsumerInfo } from '../../consumer';
import { PathOsBased } from '../../utils/path';
import { WorkspaceConfig, LegacyInitProps, transformLegacyPropsToExtensions } from './workspace-config';

export type ConfigDeps = [];

export type ConfigConfig = {};

export default async function provideConfig(_deps, _config, _slots, harmony: Harmony) {
  LegacyWorkspaceConfig.registerOnWorkspaceConfigIsExist(onLegacyWorkspaceConfigIsExist());
  LegacyWorkspaceConfig.registerOnWorkspaceConfigEnsuring(onLegacyWorkspaceEnsure());
  const consumerInfo = await getConsumerInfo(process.cwd());
  const config: Config = await Config.loadIfExist(consumerInfo?.path || process.cwd());
  LegacyWorkspaceConfig.registerOnWorkspaceConfigLoading(onLegacyWorkspaceLoad(config));

  // TODO: change once config become maybe
  if (config.extensions) {
    // Send all configs to harmony
    config?.extensions.forEach(extension => {
      harmony.config.set(extension.id, extension.config);
    });
  }
  return config;
}

function onLegacyWorkspaceConfigIsExist(): WorkspaceConfigIsExistFunction {
  return async (dirPath: PathOsBased): Promise<boolean | undefined> => {
    return WorkspaceConfig.isExist(dirPath);
  };
}

function onLegacyWorkspaceLoad(config?: Config): WorkspaceConfigLoadFunction {
  return async (dirPath: PathOsBased): Promise<ILegacyWorkspaceConfig | undefined> => {
    if (config?.workspaceConfig && config.path && dirPath === path.dirname(config.path)) {
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
      standAlone
    };
    const config = await Config.ensureWorkspace(dirPath, workspaceConfigProps, legacyInitProps);
    const workspaceConfig = config.config;
    return (workspaceConfig as WorkspaceConfig).toLegacy();
  };
  return func;
}
