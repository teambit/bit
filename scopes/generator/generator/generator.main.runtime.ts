import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import { ComponentID } from '@teambit/component-id';
import { GLOBAL_SCOPE } from '@teambit/legacy/dist/constants';
import LegacyScope from '@teambit/legacy/dist/scope/scope';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { BitError } from '@teambit/bit-error';
import { loadBit } from '@teambit/bit';
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
   * get or create a global scope, import the non-core aspects, load bit from that scope, create
   * capsules for the aspects and load them from the capsules.
   */
  async findTemplateInGlobalScope(aspectId: string, name?: string): Promise<WorkspaceTemplate | undefined> {
    const globalScope = await LegacyScope.ensure(GLOBAL_SCOPE, 'global-scope');
    await globalScope.ensureDir();
    const globalScopeHarmony = await loadBit(globalScope.path);
    const scope = globalScopeHarmony.get<ScopeMain>(ScopeAspect.id);
    const id = await scope.resolveComponentId(aspectId);
    const components = await scope.import([id]);
    if (!components.length) throw new BitError(`failed importing ${aspectId}`);
    const templateAspect = components[0];
    const resolvedAspects = await scope.getResolvedAspects([templateAspect]);
    const aspectLoader = globalScopeHarmony.get<AspectLoaderMain>(AspectLoaderAspect.id);
    await aspectLoader.loadRequireableExtensions(resolvedAspects, true);
    const generator = globalScopeHarmony.get<GeneratorMain>(GeneratorAspect.id);
    const fullAspectId = templateAspect.id.toString();
    return generator.searchRegisteredWorkspaceTemplate(name, fullAspectId);
  }

  /**
   * returns a specific workspace template.
   */
  async getWorkspaceTemplate(name: string, aspectId?: string): Promise<WorkspaceTemplate | undefined> {
    const registeredTemplate = await this.searchRegisteredWorkspaceTemplate(name, aspectId);
    if (registeredTemplate) {
      return registeredTemplate;
    }
    if (!aspectId)
      throw new BitError(`template "${name}" was not found, if this is a custom-template, please use --aspect flag`);
    const fromGlobal = await this.findTemplateInGlobalScope(aspectId, name);
    if (fromGlobal) {
      return fromGlobal;
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
    const { aspect: aspectId } = options;
    const template = await this.getWorkspaceTemplate(templateName, aspectId);
    if (!template) throw new BitError(`template "${templateName}" was not found`);
    const workspaceGenerator = new WorkspaceGenerator(workspaceName, options, template, this.envs);
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
