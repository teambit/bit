import { ComponentTemplate, WorkspaceTemplate } from '@teambit/generator';
import { reactComponent, deprecatedReactComponent } from './templates/react-component';
import { reactComponentJS, deprecatedReactComponentJS } from './templates/react-component-js';
import { reactEnvTemplate } from './templates/react-env';
import { deprecatedReactWorkspaceTemplate } from './templates/react-workspace-deprecated';
import { reactHook } from './templates/react-hook';
import { reactContext } from './templates/react-context';
import { reactAppTemplate } from './templates/react-app';
import { reactWorkspaceTemplate } from './templates/react-workspace';
import { reactWorkspaceDesignSystemTemplate } from './templates/react-workspace-design-system';
import { reactWorkspaceWikiTemplate } from './templates/react-workspace-wiki';
import { reactWorkspaceAnalyticsTemplate } from './templates/react-workspace-analytics';
import { reactWorkspaceDataFetchingTemplate } from './templates/react-workspace-data-fetching';
import { reactWorkspaceAppTemplate } from './templates/react-workspace-app';
import { reactWorkspaceLibTemplate } from './templates/react-workspace-lib';
import { reactWorkspaceBlogTemplate } from './templates/react-workspace-blog';

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
  deprecatedReactWorkspaceTemplate,
  reactWorkspaceDesignSystemTemplate,
  reactWorkspaceWikiTemplate,
  reactWorkspaceAnalyticsTemplate,
  reactWorkspaceDataFetchingTemplate,
  reactWorkspaceBlogTemplate,
];
