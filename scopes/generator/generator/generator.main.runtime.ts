import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { ComponentID } from '@teambit/component-id';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { ComponentTemplate } from './component-template';
import { GeneratorAspect } from './generator.aspect';
import { CreateCmd, GeneratorOptions } from './create.cmd';
import { TemplatesCmd } from './templates.cmd';
import { generatorSchema } from './generator.graphql';
import { ComponentGenerator, GenerateResult } from './component-generator';

export type ComponentTemplateSlot = SlotRegistry<ComponentTemplate[]>;

export type TemplateDescriptor = { aspectId: string; name: string; description?: string };

export type GeneratorConfig = {
  /**
   * array of aspects to include in the list of templates.
   */
  aspects: string[];
};

export class GeneratorMain {
  private aspectLoaded = false;
  constructor(
    private componentTemplateSlot: ComponentTemplateSlot,
    private config: GeneratorConfig,
    private workspace: Workspace
  ) {}

  /**
   * register a new component template.
   */
  registerComponentTemplate(templates: ComponentTemplate[]) {
    this.componentTemplateSlot.register(templates);
    return this;
  }

  /**
   * list all component templates registered in the workspace.
   */
  async listComponentTemplates(): Promise<TemplateDescriptor[]> {
    await this.loadAspects();
    const allTemplates = this.getAllTemplatesFlattened();
    return allTemplates.map(({ id, template }) => ({
      aspectId: id,
      name: template.name,
      description: template.description,
    }));
  }

  /**
   * get all component templates registered by a specific aspect ID.
   */
  getComponentTemplateByAspect(aspectId: string): ComponentTemplate[] {
    return this.componentTemplateSlot.get(aspectId) || [];
  }

  /**
   * returns a specific component template.
   */
  getComponentTemplate(name: string, aspectId?: string): ComponentTemplate | undefined {
    const templates = this.getAllTemplatesFlattened();
    const found = templates.find(({ id, template }) => {
      if (aspectId && id !== aspectId) return false;
      return template.name === name;
    });
    return found?.template;
  }

  async generateComponentTemplate(
    componentNames: string[],
    templateName: string,
    options: GeneratorOptions
  ): Promise<GenerateResult[]> {
    await this.loadAspects();
    const { namespace, aspect: aspectId } = options;
    const template = this.getComponentTemplate(templateName, aspectId);
    if (!template) throw new Error(`template "${templateName}" was not found`);
    const scope = options.scope || this.workspace.defaultScope;
    if (!scope) throw new Error(`failed finding defaultScope`);

    const componentIds = componentNames.map((componentName) => {
      const fullComponentName = namespace ? `${namespace}/${componentName}` : componentName;
      return ComponentID.fromObject({ name: fullComponentName }, scope);
    });

    const componentGenerator = new ComponentGenerator(this.workspace, componentIds, options, template);
    return componentGenerator.generate();
  }

  private getAllTemplatesFlattened(): Array<{ id: string; template: ComponentTemplate }> {
    const templatesByAspects = this.componentTemplateSlot.toArray();
    return templatesByAspects.flatMap(([id, componentTemplates]) => {
      return componentTemplates.map((template) => ({
        id,
        template,
      }));
    });
  }

  private async loadAspects() {
    if (this.aspectLoaded) return;
    await this.workspace.loadAspects(this.config.aspects);
    this.aspectLoaded = true;
  }

  static slots = [Slot.withType<ComponentTemplate[]>()];

  static dependencies = [WorkspaceAspect, CLIAspect, GraphqlAspect];

  static runtime = MainRuntime;

  static async provider(
    [workspace, cli, graphql]: [Workspace, CLIMain, GraphqlMain],
    config: GeneratorConfig,
    [componentTemplateSlot]: [ComponentTemplateSlot]
  ) {
    const generator = new GeneratorMain(componentTemplateSlot, config, workspace);
    const commands = [new CreateCmd(generator), new TemplatesCmd(generator)];
    cli.register(...commands);
    graphql.register(generatorSchema(generator));
    return generator;
  }
}

GeneratorAspect.addRuntime(GeneratorMain);
