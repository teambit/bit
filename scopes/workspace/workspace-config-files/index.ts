import { WorkspaceConfigFilesAspect } from './workspace-config-files.aspect';

export type {
  WorkspaceConfigFilesMain,
  WriteConfigFilesResult,
  EnvCompsDirsMap,
  EnvMapValue,
  OneConfigWriterIdResult,
  WriteResults,
} from './workspace-config-files.main.runtime';
export type {
  ConfigWriterEntry,
  ExtendingConfigFile,
  ConfigFile,
  PostProcessExtendingConfigFilesArgs,
  GenerateExtendingConfigFilesArgs,
} from './config-writer-entry';
export type { ConfigWriterHandler } from './config-writer-list';
export type { WorkspaceConfigEnv } from './workspace-config-env-type';
export { ConfigWriterList } from './config-writer-list';
export default WorkspaceConfigFilesAspect;
export { WorkspaceConfigFilesAspect };
