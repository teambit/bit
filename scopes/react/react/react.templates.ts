import {
  ReactComponentTemplate,
  ReactHookTemplate,
  ReactWebpackTemplate,
  ReactViteTemplate,
  ReactJSComponentTemplate,
  ReactEnvTemplate,
  ThemeTemplate,
} from '@bitdev/react.generators.react-templates';
import type { EnvContext } from '@teambit/envs';
import type { ComponentTemplate } from '@teambit/generator';
import { TemplateList } from '@teambit/generator';

const templateListHandler = TemplateList.from([
  ReactComponentTemplate.from({ env: 'bitdev.react/react-env' }),
  ReactViteTemplate.from({ env: 'bitdev.react/react-env' }),
  ReactHookTemplate.from({ env: 'bitdev.react/react-env' }),
  ThemeTemplate.from({ env: 'bitdev.react/react-env' }),
  // ReactContextTemplate.from({ env: 'bitdev.react/react-env' }),
  ReactWebpackTemplate.from({ env: 'bitdev.react/react-env' }),
  // ReactWebpackAppTemplate.from({ env: 'bitdev.react/react-env' }),
  ReactJSComponentTemplate.from({ env: 'bitdev.react/react-env' }),
  ReactEnvTemplate.from(),
]);

export function getTemplates(envContext: EnvContext): ComponentTemplate[] {
  const templateList = templateListHandler(envContext);
  return templateList.compute();
}
