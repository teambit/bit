import {
  NodeComponentTemplate,
  NodeEnvTemplate,
  NodeJSComponentTemplate,
  ExpressAppTemplate,
} from '@teambit/node.generator.node-templates';

import { EnvContext } from '@teambit/envs';
import { ComponentTemplate, TemplateList } from '@teambit/generator';

const templateListHandler = TemplateList.from([
  NodeComponentTemplate.from({ env: 'teambit.node/node' }),
  NodeJSComponentTemplate.from({ env: 'teambit.node/node' }),
  ExpressAppTemplate.from({ env: 'teambit.node/node' }),
  NodeEnvTemplate.from({}),
]);

export function getTemplates(envContext: EnvContext): ComponentTemplate[] {
  const templateList = templateListHandler(envContext);
  return templateList.compute();
}
