import { ComponentTemplate } from '@teambit/generator';
import { reactComponent, deprecatedReactComponent } from './templates/react-component';
import { reactComponentJS, deprecatedReactComponentJS } from './templates/react-component-js';
import { reactEnvTemplate } from './templates/react-env';
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
  deprecatedReactComponent,
  deprecatedReactComponentJS,
];
