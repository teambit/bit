import ComponentConfig from './component-config';

export {
  default as LegacyWorkspaceConfig,
  WorkspaceConfigProps as LegacyWorkspaceConfigProps,
  WorkspaceConfigEnsureFunction,
  WorkspaceConfigLoadFunction,
} from './workspace-config';
export { ILegacyWorkspaceConfig } from './legacy-workspace-config-interface';
export { ExtensionDataList, ExtensionDataEntry, REMOVE_EXTENSION_SPECIAL_SIGN } from './extension-data';
export default ComponentConfig;
