import { ComponentTemplate, WorkspaceTemplate } from '@teambit/generator';
import { reactComponent } from './templates/react-component';
import { reactComponentJS } from './templates/react-component-js';
import { reactEnvTemplate } from './templates/react-env';
import { reactWorkspaceTemplate } from './templates/react-workspace';
import { reactHook } from './templates/react-hook';
import { reactContext } from './templates/react-context';
import { reactAppTemplate } from './templates/react-app';

export const componentTemplates: ComponentTemplate[] = [
  reactComponent,
  reactContext,
  reactHook,
  reactComponentJS,
  reactEnvTemplate,
  reactAppTemplate,
];

export const workspaceTemplates: WorkspaceTemplate[] = [reactWorkspaceTemplate];
