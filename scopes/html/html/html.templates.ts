import { ComponentTemplate } from '@teambit/generator';
import { HtmlTemplate, ScssTemplate, CssTemplate, HtmlEnvTemplate } from '@teambit/html.generator.html-templates';

export const componentTemplates: ComponentTemplate[] = [
  new HtmlTemplate(),
  new ScssTemplate(),
  new CssTemplate(),
  new HtmlEnvTemplate(),
];
