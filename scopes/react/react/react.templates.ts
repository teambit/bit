import { ComponentTemplate } from '@teambit/generator';
import {
  ReactComponentTemplate,
  ReactHookTemplate,
  ReactContextTemplate,
  ReactAppTemplate,
  ReactJSComponentTemplate,
  ReactEnvTemplate,
} from '@teambit/react.generator.react-templates';

export const componentTemplates: ComponentTemplate[] = [
  new ReactComponentTemplate(),
  new ReactHookTemplate(),
  new ReactContextTemplate(),
  new ReactAppTemplate(),
  new ReactJSComponentTemplate(),
  new ReactEnvTemplate(),
];
