import ComponentConfig from './component-config';

export {
  default as LegacyWorkspaceConfig,
  WorkspaceConfigProps as LegacyWorkspaceConfigProps,
  WorkspaceConfigEnsureFunction,
  WorkspaceConfigLoadFunction
} from './workspace-config';
export { ILegacyWorkspaceConfig } from './legacy-workspace-config-interface';
export { ExtensionDataList, ExtensionDataEntry } from './extension-data';
export default ComponentConfig;
