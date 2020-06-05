import ComponentConfig from './component-config';

export {
  default as LegacyWorkspaceConfig,
  WorkspaceConfigProps as LegacyWorkspaceConfigProps,
  WorkspaceConfigEnsureFunction,
  WorkspaceConfigLoadFunction
} from './workspace-config';
export { ILegacyWorkspaceConfig } from './legacy-workspace-config-interface';
export { ExtensionConfigList, ExtensionConfigEntry, IExtensionConfigList } from './extension-config-list';
export default ComponentConfig;
