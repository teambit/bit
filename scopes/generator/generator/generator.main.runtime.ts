import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import { Component } from '@teambit/component';
import { ComponentID } from '@teambit/component-id';
import { loadBit } from '@teambit/bit';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { BitError } from '@teambit/bit-error';
import { InvalidScopeName, isValidScopeName } from '@teambit/legacy-bit-id';
import AspectLoaderAspect, { AspectLoaderMain } from '@teambit/aspect-loader';
import { ComponentTemplate } from './component-template';
import { GeneratorAspect } from './generator.aspect';
import { CreateCmd, CreateOptions } from './create.cmd';
import { TemplatesCmd } from './templates.cmd';
import { generatorSchema } from './generator.graphql';
import { ComponentGenerator, GenerateResult } from './component-generator';
import { WorkspaceGenerator } from './workspace-generator';
import { WorkspaceTemplate } from './workspace-template';
import { NewCmd, NewOptions } from './new.cmd';
import { componentGeneratorTemplate } from './templates/component-generator';
import { workspaceGeneratorTemplate } from './templates/workspace-generator';

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
    private envs: EnvsMain,
    private aspectLoader: AspectLoaderMain
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
   * list all component templates registered in the workspace or workspace templates in case the
   * workspace is not available
   */
  async listTemplates(): Promise<TemplateDescriptor[]> {
    const getTemplateDescriptor = ({
      id,
      template,
    }: {
      id: string;
      template: WorkspaceTemplate | ComponentTemplate;
    }) => ({
      aspectId: id,
      name: template.name,
      description: template.description,
      hidden: template.hidden,
    });
    return this.isRunningInsideWorkspace()
      ? this.getAllComponentTemplatesFlattened().map(getTemplateDescriptor)
      : this.getAllWorkspaceTemplatesFlattened().map(getTemplateDescriptor);
  }

  /**
   * @deprecated use this.listTemplates()
   */
  async listComponentTemplates(): Promise<TemplateDescriptor[]> {
    return this.listTemplates();
  }

  isRunningInsideWorkspace(): boolean {
    return Boolean(this.workspace);
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
   * in the case the aspect-id is given and this aspect doesn't exist locally, import it to the
   * global scope and load it from the capsule
   */
  async findTemplateInGlobalScope(aspectId: string, name?: string): Promise<WorkspaceTemplate | undefined> {
    const aspects = await this.aspectLoader.loadAspectsFromGlobalScope([aspectId]);
    const fullAspectId = aspects[0].id.toString();
    return this.searchRegisteredWorkspaceTemplate(name, fullAspectId);
  }

  async findTemplateInOtherWorkspace(workspacePath: string, name: string, aspectId?: string) {
    if (!aspectId)
      throw new BitError(
        `to load a template from a different workspace, please provide the aspect-id using --aspect flag`
      );
    const harmony = await loadBit(workspacePath);
    let workspace: Workspace;
    try {
      workspace = harmony.get<Workspace>(WorkspaceAspect.id);
    } catch (err: any) {
      throw new Error(`fatal: "${workspacePath}" is not a valid Bit workspace, make sure the path is correct`);
    }
    const aspectComponentId = await workspace.resolveComponentId(aspectId);
    await workspace.loadAspects([aspectId], true);
    const aspectFullId = aspectComponentId.toString();
    const generator = harmony.get<GeneratorMain>(GeneratorAspect.id);
    return generator.searchRegisteredWorkspaceTemplate(name, aspectFullId);
  }

  /**
   * returns a specific workspace template.
   */
  async getWorkspaceTemplate(
    name: string,
    aspectId?: string
  ): Promise<{ workspaceTemplate: WorkspaceTemplate; aspect?: Component }> {
    const registeredTemplate = await this.searchRegisteredWorkspaceTemplate(name, aspectId);
    if (registeredTemplate) {
      return { workspaceTemplate: registeredTemplate };
    }
    if (!aspectId) {
      throw new BitError(`template "${name}" was not found, if this is a custom-template, please use --aspect flag`);
    }
    const aspects = await this.aspectLoader.loadAspectsFromGlobalScope([aspectId]);
    const aspect = aspects[0];
    const fullAspectId = aspect.id.toString();
    const fromGlobal = await this.searchRegisteredWorkspaceTemplate(name, fullAspectId);
    if (fromGlobal) {
      return { workspaceTemplate: fromGlobal, aspect };
    }
    throw new BitError(`template "${name}" was not found`);
  }

  async searchRegisteredWorkspaceTemplate(name?: string, aspectId?: string): Promise<WorkspaceTemplate | undefined> {
    const templates = this.getAllWorkspaceTemplatesFlattened();
    const found = templates.find(({ id, template }) => {
      if (aspectId && name) return aspectId === id && name === template.name;
      if (aspectId) return aspectId === id;
      if (name) return name === template.name;
      throw new Error(`searchRegisteredWorkspaceTemplate expects to get "name" or "aspectId"`);
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
    if (!template) throw new BitError(`template "${templateName}" was not found`);
    const scope = options.scope || this.workspace.defaultScope;
    if (!isValidScopeName(scope)) {
      throw new InvalidScopeName(scope);
    }
    if (!scope) throw new BitError(`failed finding defaultScope`);

    const componentIds = componentNames.map((componentName) => {
      const fullComponentName = namespace ? `${namespace}/${componentName}` : componentName;
      return ComponentID.fromObject({ name: fullComponentName }, scope);
    });

    const componentGenerator = new ComponentGenerator(this.workspace, componentIds, options, template, this.envs);
    return componentGenerator.generate();
  }

  async generateWorkspaceTemplate(workspaceName: string, templateName: string, options: NewOptions) {
    if (this.workspace) {
      throw new BitError('Error: unable to generate a new workspace inside of an existing workspace');
    }
    const { aspect: aspectId, loadFrom } = options;
    let template: WorkspaceTemplate | undefined;
    let aspectComponent: Component | undefined;
    if (loadFrom) {
      template = await this.findTemplateInOtherWorkspace(loadFrom, templateName, aspectId);
    } else {
      const { workspaceTemplate, aspect } = await this.getWorkspaceTemplate(templateName, aspectId);
      template = workspaceTemplate;
      aspectComponent = aspect;
    }
    if (!template) throw new BitError(`template "${templateName}" was not found`);
    const workspaceGenerator = new WorkspaceGenerator(workspaceName, options, template, aspectComponent);
    const workspacePath = await workspaceGenerator.generate();

    return workspacePath;
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

  static dependencies = [WorkspaceAspect, CLIAspect, GraphqlAspect, EnvsAspect, AspectLoaderAspect];

  static runtime = MainRuntime;

  static async provider(
    [workspace, cli, graphql, envs, aspectLoader]: [Workspace, CLIMain, GraphqlMain, EnvsMain, AspectLoaderMain],
    config: GeneratorConfig,
    [componentTemplateSlot, workspaceTemplateSlot]: [ComponentTemplateSlot, WorkspaceTemplateSlot]
  ) {
    const generator = new GeneratorMain(
      componentTemplateSlot,
      workspaceTemplateSlot,
      config,
      workspace,
      envs,
      aspectLoader
    );
    const commands = [new CreateCmd(generator), new TemplatesCmd(generator), new NewCmd(generator)];
    cli.register(...commands);
    graphql.register(generatorSchema(generator));
    generator.registerComponentTemplate([componentGeneratorTemplate, workspaceGeneratorTemplate]);
    return generator;
  }
}

GeneratorAspect.addRuntime(GeneratorMain);
