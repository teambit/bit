import LegacyWorkspaceConfig, {
  WorkspaceConfigEnsureFunction,
  WorkspaceConfigLoadFunction
} from '../../consumer/config/workspace-config';
import { Config } from './config';
import { ILegacyWorkspaceConfig } from '../../consumer/config';

export type ConfigDeps = [];

export type ConfigConfig = {};

export default async function provideConfig() {
  const config = await Config.loadIfExist(process.cwd());
  LegacyWorkspaceConfig.registerOnWorkspaceConfigLoading(onLegacyWorkspaceLoad(config));
  LegacyWorkspaceConfig.registerOnWorkspaceConfigEnsuring(onLegacyWorkspaceEnsure());
  return config;
}

function onLegacyWorkspaceLoad(config?: Config): WorkspaceConfigLoadFunction {
  return async (): Promise<ILegacyWorkspaceConfig | undefined> => {
    if (config && config.type === 'workspace') {
      return config.config as ILegacyWorkspaceConfig;
    }
    return undefined;
  };
}

function onLegacyWorkspaceEnsure(): WorkspaceConfigEnsureFunction {
  return async (args): Promise<ILegacyWorkspaceConfig> => {
    const config = await Config.ensureWorkspace(args);
    const workspaceConfig = config.config;
    return workspaceConfig as ILegacyWorkspaceConfig;
  };
}
