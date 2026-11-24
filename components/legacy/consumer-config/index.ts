export {
  default as LegacyWorkspaceConfig,
  WorkspaceConfigProps as LegacyWorkspaceConfigProps,
  WorkspaceConfigLoadFunction,
} from './workspace-config';
export { ILegacyWorkspaceConfig } from './legacy-workspace-config-interface';
export { ComponentOverrides, DependenciesOverridesData } from './component-overrides';
// lives with the package-name logic; re-exported here for existing importers
export { getBindingPrefixByDefaultScope } from '@teambit/pkg.modules.component-package-name';
export { ComponentConfig, ComponentConfigLoadOptions } from './component-config';
export { componentOverridesForbiddenFields, nonPackageJsonFields, ComponentOverridesData } from './component-overrides';
