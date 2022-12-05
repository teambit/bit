import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { EnvDefinition, EnvsAspect, EnvsMain } from '@teambit/envs';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import { CommunityAspect } from '@teambit/community';
import type { CommunityMain } from '@teambit/community';

import ComponentAspect, { ComponentID } from '@teambit/component';
import type { ComponentMain, Component } from '@teambit/component';

import { isCoreAspect, loadBit } from '@teambit/bit';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { BitError } from '@teambit/bit-error';
import AspectLoaderAspect, { AspectLoaderMain } from '@teambit/aspect-loader';
import NewComponentHelperAspect, { NewComponentHelperMain } from '@teambit/new-component-helper';
import { compact } from 'lodash';
import ImporterAspect, { ImporterMain } from '@teambit/importer';
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
import { starterTemplate } from './templates/starter';
import { StarterPlugin } from './starter.plugin';

export type ComponentTemplateSlot = SlotRegistry<ComponentTemplate[]>;
export type WorkspaceTemplateSlot = SlotRegistry<WorkspaceTemplate[]>;

export type TemplateDescriptor = {
  aspectId: string;
  titlePrefix?: string;
  name: string;
  description?: string;
  hidden?: boolean;
};

type TemplateWithId = { id: string; envName?: string };
type WorkspaceTemplateWithId = TemplateWithId & { template: WorkspaceTemplate };
type ComponentTemplateWithId = TemplateWithId & { template: ComponentTemplate };
type AnyTemplateWithId = TemplateWithId & { template: ComponentTemplate | WorkspaceTemplate };

export type GenerateWorkspaceTemplateResult = { workspacePath: string; appName?: string };

export type GeneratorConfig = {
  /**
   * array of aspects to include in the list of templates.
   */
  aspects: string[];

  /**
   * by default core templates are shown.
   * use this to hide them unless `--show-all` flag of `bit templates` was used
   */
  hideCoreTemplates: boolean;

  /**
   * default envs.
   */
  envs?: string[];
};

export class GeneratorMain {
  private aspectLoaded = false;
  constructor(
    private componentTemplateSlot: ComponentTemplateSlot,
    private workspaceTemplateSlot: WorkspaceTemplateSlot,
    private config: GeneratorConfig,
    private workspace: Workspace,
    private envs: EnvsMain,
    private aspectLoader: AspectLoaderMain,
    private newComponentHelper: NewComponentHelperMain,
    private importer: ImporterMain,
    private componentAspect: ComponentMain
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
  async listTemplates({ aspect }: { aspect?: string } = {}): Promise<TemplateDescriptor[]> {
    if (this.isRunningInsideWorkspace()) {
      return this.getAllComponentTemplatesDescriptorsFlattened(aspect);
    }
    return this.getAllWorkspaceTemplatesDescriptorFlattened(aspect);
  }

  private getTemplateDescriptor = ({ id, template }: AnyTemplateWithId): TemplateDescriptor => {
    const shouldBeHidden = () => {
      if (template.hidden) return true;
      if (this.config.hideCoreTemplates && isCoreAspect(id)) return true;
      return false;
    };
    return {
      aspectId: id,
      name: template.name,
      description: template.description,
      hidden: shouldBeHidden(),
    };
  };

  /**
   * @deprecated use this.listTemplates()
   */
  async listComponentTemplates(opts: { aspect?: string }): Promise<TemplateDescriptor[]> {
    return this.listTemplates(opts);
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
  async getComponentTemplate(name: string, aspectId?: string): Promise<ComponentTemplateWithId | undefined> {
    const fromEnv = await this.listEnvComponentTemplates();
    if (fromEnv && fromEnv.length){
      const found = this.findTemplateByAspectIdAndName<ComponentTemplateWithId>(aspectId, name, fromEnv);
      if (found) return found;
    }
    // fallback to aspect id not from env if provided
    const templates = await this.getAllComponentTemplatesFlattened();
    const found = this.findTemplateByAspectIdAndName<ComponentTemplateWithId>(aspectId, name, templates);
    return found;
  }

  private findTemplateByAspectIdAndName<T>(
    aspectId: string | undefined,
    name: string,
    templates: Array<T>
  ): T | undefined {
    // @ts-ignore (should set T to be extends ComponentTemplateWithId or WorkspaceTemplateWithId)
    const found = templates.find(({ id, template }) => {
      if (aspectId && id !== aspectId) return false;
      return template.name === name;
    });
    return found;
  }

  /**
   * in the case the aspect-id is given and this aspect doesn't exist locally, import it to the
   * global scope and load it from the capsule
   */
  async findTemplateInGlobalScope(
    aspectId: string,
    name?: string
  ): Promise<{ workspaceTemplate?: WorkspaceTemplate; aspect?: Component }> {
    const { globalScopeHarmony, components } = await this.aspectLoader.loadAspectsFromGlobalScope([aspectId]);
    const remoteGenerator = globalScopeHarmony.get<GeneratorMain>(GeneratorAspect.id);
    const remoteEnvsAspect = globalScopeHarmony.get<EnvsMain>(EnvsAspect.id);
    const aspect = components[0];
    const fullAspectId = aspect.id.toString();
    const fromGlobal = await remoteGenerator.searchRegisteredWorkspaceTemplate.call(
      remoteGenerator,
      name,
      fullAspectId,
      remoteEnvsAspect
    );
    return { workspaceTemplate: fromGlobal, aspect };
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

    const { workspaceTemplate, aspect } = await this.findTemplateInGlobalScope(aspectId, name);
    if (workspaceTemplate) {
      return { workspaceTemplate, aspect };
    }
    throw new BitError(`template "${name}" was not found`);
  }

  async searchRegisteredWorkspaceTemplate(name?: string, aspectId?: string, remoteEnvsAspect?: EnvsMain): Promise<WorkspaceTemplate | undefined> {
    let fromEnv;

    if (aspectId) {
      fromEnv = await this.listEnvWorkspaceTemplates(aspectId, remoteEnvsAspect);

    }
    const templates = (fromEnv && fromEnv.length) ? fromEnv : this.getAllWorkspaceTemplatesFlattened();
    const found = templates.find(({ id, template: tpl }) => {
      if (aspectId && name) return aspectId === id && name === tpl.name;
      if (aspectId) return aspectId === id;
      if (name) return name === tpl.name;
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
    const templateWithId = await this.getComponentTemplate(templateName, aspectId);
    if (!templateWithId) throw new BitError(`template "${templateName}" was not found`);

    const componentIds = componentNames.map((componentName) =>
      this.newComponentHelper.getNewComponentId(componentName, namespace, options.scope)
    );

    const componentGenerator = new ComponentGenerator(
      this.workspace,
      componentIds,
      options,
      templateWithId.template,
      this.envs,
      this.newComponentHelper,
      templateWithId.id,
      templateWithId.envName ? ComponentID.fromString(templateWithId.id) : undefined
    );
    return componentGenerator.generate();
  }

  async generateWorkspaceTemplate(
    workspaceName: string,
    templateName: string,
    options: NewOptions
  ): Promise<GenerateWorkspaceTemplateResult> {
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

    return { workspacePath, appName: template.appName };
  }

  private async getAllComponentTemplatesDescriptorsFlattened(aspectId?: string): Promise<Array<TemplateDescriptor>> {
    const envTemplates = await this.listEnvComponentTemplateDescriptors();
    if (envTemplates && envTemplates.length) {
      if (!aspectId) return envTemplates;
      const filtered = envTemplates.filter((template) => template.aspectId === aspectId);
      if (filtered.length) return filtered;
    }

    const flattened = this.getAllComponentTemplatesFlattened();
    const filtered = aspectId ? flattened.filter((template) => template.id === aspectId) : flattened;
    return filtered.map((template) => this.getTemplateDescriptor(template));
  }

  private getAllComponentTemplatesFlattened(): Array<{ id: string; template: ComponentTemplate }> {
    const templatesByAspects = this.componentTemplateSlot.toArray();
    const flattened = templatesByAspects.flatMap(([id, componentTemplates]) => {
      return componentTemplates.map((template) => ({
        id,
        template,
      }));
    });
    return flattened;
  }

  private async getAllWorkspaceTemplatesDescriptorFlattened(aspectId?: string): Promise<Array<TemplateDescriptor>> {
    let envTemplates;
    if (aspectId) {
      envTemplates = await this.listEnvWorkspaceTemplates(aspectId);
    }

    const templates = envTemplates && envTemplates.length ? envTemplates : this.getAllWorkspaceTemplatesFlattened();
    return templates.map((template) => this.getTemplateDescriptor(template));
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

  /**
   * list all starter templates registered by an env.
   */
  async listEnvWorkspaceTemplates(
    envId: string,
    remoteEnvsAspect?: EnvsMain
  ): Promise<Array<WorkspaceTemplateWithId>> {
    const envs = await this.loadEnvs([envId], remoteEnvsAspect);
    const workspaceTemplates = envs.flatMap((env) => {
      if (!env.env.getGeneratorStarters) return undefined;
      const envStarters = env.env.getGeneratorStarters();
      return envStarters.map((starter) => {
        const componentId = ComponentID.fromString(env.id);
        return {
          id: componentId.toString(),
          envName: env.name,
          template: starter,
        };
      });
    });

    return compact(workspaceTemplates);
  }

  /**
   * list all component templates registered by an env.
   */
  async listEnvComponentTemplateDescriptors(ids: string[] = []): Promise<TemplateDescriptor[]> {
    const envTemplates = await this.listEnvComponentTemplates(ids);
    const templates: TemplateDescriptor[] = envTemplates.map((envTemplate) => {
      const componentId = ComponentID.fromString(envTemplate.id);
      return {
        aspectId: componentId.toStringWithoutVersion(),
        titlePrefix: envTemplate.envName,
        ...envTemplate.template,
      };
    });

    return templates;
  }

  async listEnvComponentTemplates(
    ids: string[] = []
  ): Promise<Array<ComponentTemplateWithId>> {
    const configEnvs = this.config.envs || [];
    const envs = await this.loadEnvs(configEnvs?.concat(ids));
    const templates = envs.flatMap((env) => {
      if (!env.env.getGeneratorTemplates) return [];
      const tpls = env.env.getGeneratorTemplates() || [];
      return tpls.map((template) => {
        const componentId = ComponentID.fromString(env.id);
        return {
          id: componentId.toString(),
          envName: env.name,
          template,
        };
      });
    });

    return templates;
  }

  async loadEnvs(ids: string[] = this.config.envs || [], remoteEnvsAspect?: EnvsMain): Promise<EnvDefinition[]> {
    // In case we have remoteEnvsAspect it means that we are running from the global scope
    // in that case the aspect / env were already loaded before to the global scope harmony instance
    // so no reason to load it here
    if (!remoteEnvsAspect){
      const host = this.componentAspect.getHost();
      if (!host) return [];
      await host.loadAspects(ids);
    }

    const envsAspect = remoteEnvsAspect || this.envs;

    const potentialEnvs = ids.map((id) => {
      const componentId = ComponentID.fromString(id);
      return envsAspect.getEnvDefinition(componentId);
    });

    return compact(potentialEnvs);
  }

  async loadAspects() {
    if (this.aspectLoaded) return;
    await this.workspace.loadAspects(this.config.aspects);
    this.aspectLoaded = true;
  }

  static slots = [Slot.withType<ComponentTemplate[]>(), Slot.withType<WorkspaceTemplate[]>()];

  static dependencies = [
    WorkspaceAspect,
    CLIAspect,
    GraphqlAspect,
    EnvsAspect,
    AspectLoaderAspect,
    NewComponentHelperAspect,
    CommunityAspect,
    ImporterAspect,
    ComponentAspect
  ];

  static runtime = MainRuntime;

  static async provider(
    [workspace, cli, graphql, envs, aspectLoader, newComponentHelper, community, importer, componentAspect]: [
      Workspace,
      CLIMain,
      GraphqlMain,
      EnvsMain,
      AspectLoaderMain,
      NewComponentHelperMain,
      CommunityMain,
      ImporterMain,
      ComponentMain
    ],
    config: GeneratorConfig,
    [componentTemplateSlot, workspaceTemplateSlot]: [ComponentTemplateSlot, WorkspaceTemplateSlot]
  ) {
    const generator = new GeneratorMain(
      componentTemplateSlot,
      workspaceTemplateSlot,
      config,
      workspace,
      envs,
      aspectLoader,
      newComponentHelper,
      importer,
      componentAspect
    );
    const commands = [
      new CreateCmd(generator, community.getDocsDomain()),
      new TemplatesCmd(generator),
      new NewCmd(generator),
    ];
    cli.register(...commands);
    graphql.register(generatorSchema(generator));
    aspectLoader.registerPlugins([new StarterPlugin(generator)]);

    generator.registerComponentTemplate([componentGeneratorTemplate, starterTemplate, workspaceGeneratorTemplate]);
    return generator;
  }
}

GeneratorAspect.addRuntime(GeneratorMain);
