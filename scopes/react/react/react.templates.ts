import { ComponentTemplate, WorkspaceTemplate } from '@teambit/generator';
import { reactComponent } from './templates/react-component';
import { reactComponentJS } from './templates/react-component-js';
import { reactEnvTemplate } from './templates/react-env';
import { reactWorkspaceTemplate } from './templates/react-workspace';

export const componentTemplates: ComponentTemplate[] = [reactComponent, reactComponentJS, reactEnvTemplate];

export const workspaceTemplates: WorkspaceTemplate[] = [reactWorkspaceTemplate];
