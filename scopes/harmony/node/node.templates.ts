import {
  NodeModuleTemplate,
  NodeAppTemplate,
  PlatformTemplate,
  GraphQLServerTemplate,
  EntityTemplate,
  ExpressAppTemplate,
  NodeEnvTemplate,
  BitAppTemplate,
} from '@bitdev/node.generators.node-templates';

import type { EnvContext } from '@teambit/envs';
import type { ComponentTemplate } from '@teambit/generator';
import { TemplateList } from '@teambit/generator';

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
