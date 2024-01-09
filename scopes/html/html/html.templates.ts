import { HtmlTemplate, ScssTemplate, CssTemplate, HtmlEnvTemplate } from '@teambit/html.generator.html-templates';
import { EnvContext } from '@teambit/envs';
import { ComponentTemplate, TemplateList } from '@teambit/generator';

const templateListHandler = TemplateList.from([
  HtmlTemplate.from({ env: 'teambit.html/html-env' }),
  ScssTemplate.from({ env: 'teambit.html/html-env' }),
  CssTemplate.from({ env: 'teambit.html/html-env' }),
  HtmlEnvTemplate.from({}),
]);

export function getTemplates(envContext: EnvContext): ComponentTemplate[] {
  const templateList = templateListHandler(envContext);
  return templateList.compute();
}
