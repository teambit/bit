import { ComponentTemplate } from '@teambit/generator';
import { MdxComponentTemplate, MdxEnvTemplate } from '@teambit/mdx.generator.mdx-templates';

export const componentTemplates: ComponentTemplate[] = [
  MdxComponentTemplate.from({ env: 'teambit.mdx/mdx-env' }),
  MdxEnvTemplate.from({}),
];
