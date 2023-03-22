import { WorkspaceConfigFilesAspect } from './workspace-config-files.aspect';

export type { WorkspaceConfigFilesMain, WrittenConfigFile, EnvCompsDirsMap, EnvMapValue } from './workspace-config-files.main.runtime';
export type { ConfigWriterEntry, ExtendingConfigFile, ConfigFile, PostProcessExtendingConfigFilesArgs } from './config-writer-entry';
export default WorkspaceConfigFilesAspect;
export { WorkspaceConfigFilesAspect };
