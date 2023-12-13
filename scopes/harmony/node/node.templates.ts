import {
  NodeModuleTemplate,
  GraphQLServerTemplate,
  EntityTemplate,
  ExpressAppTemplate,
  NodeEnvTemplate,
  BitAppTemplate,
} from '@bitdev/node.generators.node-templates';

import { EnvContext } from '@teambit/envs';
import { ComponentTemplate, TemplateList } from '@teambit/generator';

const templateListHandler = TemplateList.from([
  NodeModuleTemplate.from({ env: 'teambit.node/node' }),
  GraphQLServerTemplate.from({ env: 'teambit.node/node' }),
  EntityTemplate.from({ env: 'teambit.node/node' }),
  ExpressAppTemplate.from({ env: 'teambit.node/node' }),
  BitAppTemplate.from({ env: 'teambit.node/node' }),
  NodeEnvTemplate.from({}),
]);

export function getTemplates(envContext: EnvContext): ComponentTemplate[] {
  const templateList = templateListHandler(envContext);
  return templateList.compute();
}
