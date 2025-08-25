import { MdxComponentTemplate, MdxEnvTemplate } from '@teambit/mdx.generator.mdx-templates';
import type { EnvContext } from '@teambit/envs';
import type { ComponentTemplate } from '@teambit/generator';
import { TemplateList } from '@teambit/generator';

const templateListHandler = TemplateList.from([
  MdxComponentTemplate.from({ env: 'teambit.mdx/mdx-env' }),
  MdxEnvTemplate.from({}),
]);

export function getTemplates(envContext: EnvContext): ComponentTemplate[] {
  const templateList = templateListHandler(envContext);
  return templateList.compute();
}
