import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import { ComponentID } from '@teambit/component-id';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { InvalidScopeName, isValidScopeName } from '@teambit/legacy-bit-id';
import { ComponentTemplate } from './component-template';
import { GeneratorAspect } from './generator.aspect';
import { CreateCmd, CreateOptions } from './create.cmd';
import { TemplatesCmd } from './templates.cmd';
import { generatorSchema } from './generator.graphql';
import { ComponentGenerator, GenerateResult } from './component-generator';
import { WorkspaceGenerator } from './workspace-generator';
import { WorkspaceTemplate } from './workspace-template';
import { NewCmd, NewOptions } from './new.cmd';
import { generatorTemplate } from './templates/generator';

export type ComponentTemplateSlot = SlotRegistry<ComponentTemplate[]>;
export type WorkspaceTemplateSlot = SlotRegistry<WorkspaceTemplate[]>;

export type TemplateDescriptor = { aspectId: string; name: string; description?: string; hidden?: boolean };

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
    private workspaceTemplateSlot: WorkspaceTemplateSlot,
    private config: GeneratorConfig,
    private workspace: Workspace,
    private envs: EnvsMain
  ) {}

  /**
   * register a new component template.
   */
  registerComponentTemplate(templates: ComponentTemplate[]) {
    this.componentTemplateSlot.register(templates);
    return this;
  }

  /**
   * register a new component template.
   */
  registerWorkspaceTemplate(templates: WorkspaceTemplate[]) {
    this.workspaceTemplateSlot.register(templates);
    return this;
  }

  /**
   * list all component templates registered in the workspace.
   */
  async listComponentTemplates(): Promise<TemplateDescriptor[]> {
    if (this.workspace) {
      await this.loadAspects();
      const allTemplates = this.getAllComponentTemplatesFlattened();
      return allTemplates.map(({ id, template }) => ({
        aspectId: id,
        name: template.name,
        description: template.description,
        hidden: template.hidden,
      }));
    }
    const allTemplates = this.getAllWorkspaceTemplatesFlattened();
    return allTemplates.map(({ id, template }) => ({
      aspectId: id,
      name: template.name,
      description: template.description,
      hidden: template.hidden,
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
    const templates = this.getAllComponentTemplatesFlattened();
    const found = templates.find(({ id, template }) => {
      if (aspectId && id !== aspectId) return false;
      return template.name === name;
    });
    return found?.template;
  }

  /**
   * returns a specific workspace template.
   */
  getWorkspaceTemplate(name: string, aspectId?: string): WorkspaceTemplate | undefined {
    const templates = this.getAllWorkspaceTemplatesFlattened();
    const found = templates.find(({ id, template }) => {
      if (aspectId && id !== aspectId) return false;
      return template.name === name;
    });
    return found?.template;
  }

  async generateComponentTemplate(
    componentNames: string[],
    templateName: string,
    options: CreateOptions
  ): Promise<GenerateResult[]> {
    if (!this.workspace) throw new ConsumerNotFound();
    await this.loadAspects();
    const { namespace, aspect: aspectId } = options;
    const template = this.getComponentTemplate(templateName, aspectId);
    if (!template) throw new Error(`template "${templateName}" was not found`);
    const scope = options.scope || this.workspace.defaultScope;
    if (!isValidScopeName(scope)) {
      throw new InvalidScopeName(scope);
    }
    if (!scope) throw new Error(`failed finding defaultScope`);

    const componentIds = componentNames.map((componentName) => {
      const fullComponentName = namespace ? `${namespace}/${componentName}` : componentName;
      return ComponentID.fromObject({ name: fullComponentName }, scope);
    });

    const componentGenerator = new ComponentGenerator(this.workspace, componentIds, options, template, this.envs);
    return componentGenerator.generate();
  }

  async generateWorkspaceTemplate(workspaceName: string, templateName: string, options: NewOptions) {
    const { aspect: aspectId } = options;
    const template = this.getWorkspaceTemplate(templateName, aspectId);
    if (!template) throw new Error(`template "${templateName}" was not found`);
    const workspaceGenerator = new WorkspaceGenerator(workspaceName, options, template, this.envs);
    return workspaceGenerator.generate();
  }

  private getAllComponentTemplatesFlattened(): Array<{ id: string; template: ComponentTemplate }> {
    const templatesByAspects = this.componentTemplateSlot.toArray();
    return templatesByAspects.flatMap(([id, componentTemplates]) => {
      return componentTemplates.map((template) => ({
        id,
        template,
      }));
    });
  }

  private getAllWorkspaceTemplatesFlattened(): Array<{ id: string; template: WorkspaceTemplate }> {
    const templatesByAspects = this.workspaceTemplateSlot.toArray();
    return templatesByAspects.flatMap(([id, workspaceTemplates]) => {
      return workspaceTemplates.map((template) => ({
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

  static slots = [Slot.withType<ComponentTemplate[]>(), Slot.withType<WorkspaceTemplate[]>()];

  static dependencies = [WorkspaceAspect, CLIAspect, GraphqlAspect, EnvsAspect];

  static runtime = MainRuntime;

  static async provider(
    [workspace, cli, graphql, envs]: [Workspace, CLIMain, GraphqlMain, EnvsMain],
    config: GeneratorConfig,
    [componentTemplateSlot, workspaceTemplateSlot]: [ComponentTemplateSlot, WorkspaceTemplateSlot]
  ) {
    const generator = new GeneratorMain(componentTemplateSlot, workspaceTemplateSlot, config, workspace, envs);
    const commands = [new CreateCmd(generator), new TemplatesCmd(generator), new NewCmd(generator)];
    cli.register(...commands);
    graphql.register(generatorSchema(generator));
    generator.registerComponentTemplate([generatorTemplate]);
    return generator;
  }
}

GeneratorAspect.addRuntime(GeneratorMain);
