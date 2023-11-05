import { MdxComponentTemplate, MdxEnvTemplate } from '@teambit/mdx.generator.mdx-templates';
import { EnvContext } from '@teambit/envs';
import { ComponentTemplate, TemplateList } from '@teambit/generator';

const templateListHandler = TemplateList.from([
  MdxComponentTemplate.from({ env: 'teambit.mdx/mdx-env' }),
  MdxEnvTemplate.from({}),
]);

export function getTemplates(envContext: EnvContext): ComponentTemplate[] {
  const templateList = templateListHandler(envContext);
  return templateList.compute();
}
