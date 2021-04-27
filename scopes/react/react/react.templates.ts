import { ComponentTemplate, WorkspaceTemplate } from '@teambit/generator';
import { reactComponent } from './templates/react-component';
import { reactComponentJS } from './templates/react-component-js';
import { reactEnvTemplate } from './templates/react-env';
import { reactWorkspaceTemplate } from './templates/react-workspace';
import { reactHook } from './templates/react-hook';
import { reactContext } from './templates/react-context';
import { MDXComponent } from './templates/mdx-component';

export const componentTemplates: ComponentTemplate[] = [
  reactComponent,
  reactContext,
  reactHook,
  reactComponentJS,
  reactEnvTemplate,
  MDXComponent,
];

export const workspaceTemplates: WorkspaceTemplate[] = [reactWorkspaceTemplate];
