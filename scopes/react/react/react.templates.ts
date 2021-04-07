import { ComponentTemplate, WorkspaceTemplate } from '@teambit/generator';
import { reactButton } from './templates/react-button';
import { reactButtonJSX } from './templates/react-button-jsx';
import { reactComponent } from './templates/react-component';
import { reactComponentJSX } from './templates/react-component-jsx';
import { reactEnvTemplate } from './templates/react-env';
import { reactWorkspaceTemplate } from './templates/react-workspace';

export const componentTemplates: ComponentTemplate[] = [
  reactButton,
  reactComponent,
  reactButtonJSX,
  reactComponentJSX,
  reactEnvTemplate,
];

export const workspaceTemplates: WorkspaceTemplate[] = [reactWorkspaceTemplate];
