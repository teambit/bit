export { ConfigMain } from './config.main.runtime';
export { ConfigAspect, ConfigRuntime } from './config.aspect';
export type { ComponentScopeDirMap, WorkspaceExtensionProps, WorkspaceConfigFileProps } from './workspace-config';
export { WorkspaceConfig } from './workspace-config';
// kept for existing starters. new code imports them from @teambit/harmony.modules.workspace-config-template.
export {
  getWorkspaceConfigTemplateParsed,
  stringifyWorkspaceConfig,
} from '@teambit/harmony.modules.workspace-config-template';
