import path from 'path';
import { Harmony } from '@teambit/harmony';
import LegacyWorkspaceConfig, {
  WorkspaceConfigEnsureFunction,
  WorkspaceConfigLoadFunction
} from '../../consumer/config/workspace-config';
import { Config } from './config';
import { ILegacyWorkspaceConfig } from '../../consumer/config';
import { PathOsBased } from '../../utils/path';
import { WorkspaceConfig } from './workspace-config';

export type ConfigDeps = [];

export type ConfigConfig = {};

export default async function provideConfig(_deps, _config, _slots, harmony: Harmony) {
  const config = await Config.loadIfExist(process.cwd());
  LegacyWorkspaceConfig.registerOnWorkspaceConfigLoading(onLegacyWorkspaceLoad(config));
  LegacyWorkspaceConfig.registerOnWorkspaceConfigEnsuring(onLegacyWorkspaceEnsure());
  // TODO: change once config become maybe
  if (config.extensions) {
    // Send all configs to harmony
    config?.extensions.forEach(extension => {
      harmony.config.set(extension.id, extension.config);
    });
  }
  return config;
}

function onLegacyWorkspaceLoad(config?: Config): WorkspaceConfigLoadFunction {
  return async (dirPath: PathOsBased): Promise<ILegacyWorkspaceConfig | undefined> => {
    if (config && config.type === 'workspace' && dirPath === path.dirname(config.path)) {
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
  return async (args): Promise<ILegacyWorkspaceConfig> => {
    const config = await Config.ensureWorkspace(args);
    const workspaceConfig = config.config;
    return (workspaceConfig as WorkspaceConfig).toLegacy();
  };
}
