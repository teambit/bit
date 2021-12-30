import { ComponentTemplate, WorkspaceTemplate } from '@teambit/generator';
import { reactNativeEnvTemplate } from './templates/react-native-env';
import { reactNativeComponent } from './templates/react-native-component';
import { reactWorkspaceTemplate } from './templates/react-workspace';

export const componentTemplates: ComponentTemplate[] = [reactNativeEnvTemplate, reactNativeComponent];

export const workspaceTemplates: WorkspaceTemplate[] = [reactWorkspaceTemplate];
