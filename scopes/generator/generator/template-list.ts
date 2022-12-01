import { EnvContext, EnvHandler } from "@teambit/envs";
import { ComponentTemplate } from "./component-template";

export type TemplateListOptions = {
  name?: string;
};

export class TemplateList {
  constructor(
    readonly name: string,
    private templates: EnvHandler<ComponentTemplate>[],
    private context: EnvContext
  ) {}

  compute(): ComponentTemplate[] {
    return this.templates.map((template) => template(this.context))
  }

  static from(templates: EnvHandler<ComponentTemplate>[], options: TemplateListOptions = {}) {
    return (context: EnvContext) => {
      const name = options.name || 'template-list';
      return new TemplateList(name, templates, context);
    };
  }
}
