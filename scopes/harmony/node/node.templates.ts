import { ComponentTemplate } from '@teambit/generator';
import {
  NodeComponentTemplate,
  NodeEnvTemplate,
  NodeJSComponentTemplate,
  ExpressAppTemplate,
} from '@teambit/node.generator.node-templates';

export const componentTemplates: ComponentTemplate[] = [
  NodeComponentTemplate.from({ env: 'teambit.node/node' }),
  NodeJSComponentTemplate.from({ env: 'teambit.node/node' }),
  ExpressAppTemplate.from({ env: 'teambit.node/node' }),
  NodeEnvTemplate.from({}),
];
