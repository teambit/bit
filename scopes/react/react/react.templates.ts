import {
  ReactComponentTemplate,
  ReactHookTemplate,
  ReactContextTemplate,
  ReactAppTemplate,
  ReactJSComponentTemplate,
  ReactEnvTemplate,
} from '@teambit/react.generator.react-templates';
import { EnvContext } from '@teambit/envs';
import { ComponentTemplate, TemplateList } from '@teambit/generator';

const templateListHandler = TemplateList.from([
  ReactComponentTemplate.from({ env: 'bitdev.react/react-env' }),
  ReactHookTemplate.from({ env: 'bitdev.react/react-env' }),
  ReactContextTemplate.from({ env: 'bitdev.react/react-env' }),
  ReactAppTemplate.from({ env: 'bitdev.react/react-env' }),
  ReactJSComponentTemplate.from({ env: 'bitdev.react/react-env' }),
  ReactEnvTemplate.from({}),
]);

export function getTemplates(envContext: EnvContext): ComponentTemplate[] {
  const templateList = templateListHandler(envContext);
  return templateList.compute();
}
