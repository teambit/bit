import {
  NodeModuleTemplate,
  GraphQLServerTemplate,
  EntityTemplate,
  ExpressAppTemplate,
  NodeEnvTemplate,
  BitAppTemplate,
  PlatformTemplate,
  NodeAppTemplate,
} from '@bitdev/node.generators.node-templates';

import { EnvContext } from '@teambit/envs';
import { ComponentTemplate, TemplateList } from '@teambit/generator';

const templateListHandler = TemplateList.from([
  NodeModuleTemplate.from({ env: 'bitdev.node/node-env' }),
  GraphQLServerTemplate.from({ env: 'bitdev.node/node-env' }),
  EntityTemplate.from({ env: 'bitdev.node/node-env' }),
  ExpressAppTemplate.from({ env: 'bitdev.node/node-env' }),
  BitAppTemplate.from({ env: 'bitdev.node/node-env' }),
  PlatformTemplate.from({ env: 'bitdev.node/node-env' }),
  NodeAppTemplate.from({ env: 'bitdev.node/node-env' }),
  NodeEnvTemplate.from({}),
]);

export function getTemplates(envContext: EnvContext): ComponentTemplate[] {
  const templateList = templateListHandler(envContext);
  return templateList.compute();
}
