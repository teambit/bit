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
  ReactComponentTemplate.from({ env: 'bitdev.react/react-env' }),
  ReactHookTemplate.from({ env: 'bitdev.react/react-env' }),
  ReactContextTemplate.from({ env: 'bitdev.react/react-env' }),
  ReactAppTemplate.from({ env: 'bitdev.react/react-env' }),
  ReactJSComponentTemplate.from({ env: 'bitdev.react/react-env' }),
  ReactEnvTemplate.from({}),
];
