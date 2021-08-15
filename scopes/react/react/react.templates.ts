import { ComponentTemplate, WorkspaceTemplate } from '@teambit/generator';
import { reactComponent, deprecatedReactComponent } from './templates/react-component';
import { reactComponentJS, deprecatedReactComponentJS } from './templates/react-component-js';
import { reactEnvTemplate } from './templates/react-env';
import { reactWorkspaceEmptyTemplate } from './templates/react-workspace-empty';
import { reactHook } from './templates/react-hook';
import { reactContext } from './templates/react-context';
import { reactAppTemplate } from './templates/react-app';
import { reactWorkspaceTemplate } from './templates/react-workspace';
import { reactWorkspaceAppTemplate } from './templates/react-workspace-app';
import { reactWorkspaceLibTemplate } from './templates/react-workspace-lib';

export const componentTemplates: ComponentTemplate[] = [
  reactComponent,
  reactContext,
  reactHook,
  reactComponentJS,
  reactEnvTemplate,
  reactAppTemplate,
  deprecatedReactComponent,
  deprecatedReactComponentJS,
];

export const workspaceTemplates: WorkspaceTemplate[] = [
  reactWorkspaceTemplate,
  reactWorkspaceAppTemplate,
  reactWorkspaceLibTemplate,
  reactWorkspaceEmptyTemplate,
];
