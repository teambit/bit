import { ComponentTemplate } from '@teambit/generator';
import { HtmlTemplate, ScssTemplate, CssTemplate, HtmlEnvTemplate } from '@teambit/html.generator.html-templates';

export const componentTemplates: ComponentTemplate[] = [
  HtmlTemplate.from({ env: 'teambit.html/html-env' }),
  ScssTemplate.from({ env: 'teambit.html/html-env' }),
  CssTemplate.from({ env: 'teambit.html/html-env' }),
  HtmlEnvTemplate.from({}),
];
