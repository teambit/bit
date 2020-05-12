import ComponentConfig from './component-config';

export {
  default as LegacyWorkspaceConfig,
  WorkspaceConfigEnsureFunction,
  WorkspaceConfigLoadFunction
} from './workspace-config';
export { ILegacyWorkspaceConfig, ILegacyWorkspaceSettings } from './legacy-workspace-config-interface';
export { ExtensionConfigList, ExtensionConfigEntry } from './extension-config-list';
export default ComponentConfig;
