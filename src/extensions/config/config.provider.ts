import path from 'path';
import LegacyWorkspaceConfig, {
  WorkspaceConfigEnsureFunction,
  WorkspaceConfigLoadFunction
} from '../../consumer/config/workspace-config';
import { Config } from './config';
import { ILegacyWorkspaceConfig } from '../../consumer/config';
import { PathOsBased } from '../../utils/path';

export type ConfigDeps = [];

export type ConfigConfig = {};

export default async function provideConfig() {
  const config = await Config.loadIfExist(process.cwd());
  LegacyWorkspaceConfig.registerOnWorkspaceConfigLoading(onLegacyWorkspaceLoad(config));
  LegacyWorkspaceConfig.registerOnWorkspaceConfigEnsuring(onLegacyWorkspaceEnsure());
  return config;
}

function onLegacyWorkspaceLoad(config?: Config): WorkspaceConfigLoadFunction {
  return async (dirPath: PathOsBased): Promise<ILegacyWorkspaceConfig | undefined> => {
    if (config && config.type === 'workspace' && dirPath === path.dirname(config.path)) {
      return (config.config as any) as ILegacyWorkspaceConfig;
    }
    const newConfig = await Config.loadIfExist(dirPath);
    if (newConfig && newConfig.type === 'workspace') {
      return (newConfig.config as any) as ILegacyWorkspaceConfig;
    }
    return undefined;
  };
}

function onLegacyWorkspaceEnsure(): WorkspaceConfigEnsureFunction {
  return async (args): Promise<ILegacyWorkspaceConfig> => {
    const config = await Config.ensureWorkspace(args);
    const workspaceConfig = config.config;
    return (workspaceConfig as any) as ILegacyWorkspaceConfig;
  };
}
