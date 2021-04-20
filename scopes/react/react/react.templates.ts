import { ComponentTemplate, WorkspaceTemplate } from '@teambit/generator';
import { reactComponent } from './templates/react-component';
import { reactComponentJS } from './templates/react-component-js';
import { reactEnvTemplate } from './templates/react-env';
import { reactWorkspaceTemplate } from './templates/react-workspace';
import { reactHook } from './templates/react-hook';
import { reactThemeContext } from './templates/react-theme-context';

export const componentTemplates: ComponentTemplate[] = [
  reactComponent,
  reactThemeContext,
  reactHook,
  reactComponentJS,
  reactEnvTemplate,
];

export const workspaceTemplates: WorkspaceTemplate[] = [reactWorkspaceTemplate];
