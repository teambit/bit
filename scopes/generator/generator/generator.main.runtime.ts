import fs from 'fs-extra';
import camelCase from 'camelcase';
import { resolve } from 'path';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { WorkspaceAspect, OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { EnvDefinition, EnvsAspect, EnvsMain } from '@teambit/envs';
import { ComponentConfig } from '@teambit/legacy.consumer-config';
import { WorkspaceConfigFilesAspect, WorkspaceConfigFilesMain } from '@teambit/workspace-config-files';
import { ComponentAspect, ComponentID } from '@teambit/component';
import type { ComponentMain, Component } from '@teambit/component';
import { Scope as LegacyScope } from '@teambit/legacy.scope';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import { GitAspect, GitMain } from '@teambit/git';
import { BitError } from '@teambit/bit-error';
import { AspectLoaderAspect, AspectLoaderMain } from '@teambit/aspect-loader';
import { TrackerAspect, TrackerMain } from '@teambit/tracker';
import { NewComponentHelperAspect, NewComponentHelperMain } from '@teambit/new-component-helper';
import { compact, uniq } from 'lodash';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { DeprecationAspect, DeprecationMain } from '@teambit/deprecation';
import { ComponentTemplate, GetComponentTemplates, PromptResults } from './component-template';
import { GeneratorAspect } from './generator.aspect';
import { CreateCmd, CreateOptions } from './create.cmd';
import { TemplatesCmd } from './templates.cmd';
import { generatorSchema } from './generator.graphql';
import { ComponentGenerator, GenerateResult, InstallOptions, OnComponentCreateFn } from './component-generator';
import { WorkspaceGenerator } from './workspace-generator';
import { WorkspaceTemplate } from './workspace-template';
import { NewCmd, NewOptions } from './new.cmd';
import {
  componentGeneratorTemplate,
  componentGeneratorTemplateStandalone,
  starterTemplate,
  starterTemplateStandalone,
} from './templates';
import { BasicWorkspaceStarter } from './templates/basic';
import { StarterPlugin } from './starter.plugin';
import { GeneratorService } from './generator.service';
import { WorkspacePathExists } from './exceptions/workspace-path-exists';
import { GLOBAL_SCOPE } from '@teambit/legacy.constants';

export type ComponentTemplateSlot = SlotRegistry<ComponentTemplate[] | GetComponentTemplates>;
export type WorkspaceTemplateSlot = SlotRegistry<WorkspaceTemplate[]>;
export type OnComponentCreateSlot = SlotRegistry<OnComponentCreateFn>;

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

type LegacyGlobal = { classInstance: any; methodName: string; value: any; empty: any };
export type BitApi = {
  isCoreAspect: (id: string) => boolean;
  loadBit: (path?: string) => Promise<Harmony>;
  restoreGlobalsFromSnapshot: (globals: LegacyGlobal[]) => void;
  takeLegacyGlobalsSnapshot: () => LegacyGlobal[];
};

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
  private bitApi: BitApi;
  constructor(
    private componentTemplateSlot: ComponentTemplateSlot,
    private workspaceTemplateSlot: WorkspaceTemplateSlot,
    private onComponentCreateSlot: OnComponentCreateSlot,
    private config: GeneratorConfig,
    private workspace: Workspace,
    private envs: EnvsMain,
    private aspectLoader: AspectLoaderMain,
    private newComponentHelper: NewComponentHelperMain,
    private componentAspect: ComponentMain,
    private tracker: TrackerMain,
    private logger: Logger,
    private git: GitMain,
    private wsConfigFiles: WorkspaceConfigFilesMain,
    private deprecation: DeprecationMain
  ) {}

  setBitApi(bitApi: BitApi) {
    this.bitApi = bitApi;
  }

  /**
   * register a new component template.
   * @param templates array of component templates or a function that returns an array of component templates.
   * prefer to use the function to improve performance by loading the templates only when needed.
   */
  registerComponentTemplate(templates: ComponentTemplate[] | GetComponentTemplates) {
    this.componentTemplateSlot.register(templates);
    return this;
  }

  /**
   * register a new workspace starter.
   */
  registerWorkspaceTemplate(templates: WorkspaceTemplate[]) {
    this.workspaceTemplateSlot.register(templates);
    return this;
  }

  registerOnComponentCreate(fn: OnComponentCreateFn) {
    this.onComponentCreateSlot.register(fn);
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
      if (this.config.hideCoreTemplates && this.bitApi.isCoreAspect(id)) return true;
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
    const result = this.componentTemplateSlot.get(aspectId);
    if (!result) return [];
    if (Array.isArray(result)) return result;
    return result();
  }

  /**
   * returns a specific component template.
   */
  async getComponentTemplate(name: string, aspectId?: string): Promise<ComponentTemplateWithId | undefined> {
    const fromEnv = await this.listEnvComponentTemplates([], aspectId);
    if (fromEnv && fromEnv.length) {
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
      // When doing something like:
      // bit create react-env my-env --aspect teambit.react/react-env
      // we will get the aspectId without version
      // but the env might be loaded from the global scope then it will be with a version
      // so it won't found if we don't look for it like this
      const idWithoutVersion = id.split('@')[0];
      if (aspectId && id !== aspectId && idWithoutVersion !== aspectId) return false;
      return template.name === name;
    });
    return found;
  }

  /**
   * get or create a global scope, import the non-core aspects, load bit from that scope, create
   * capsules for the aspects and load them from the capsules.
   */
  private async loadAspectsFromGlobalScope(
    aspectIds: string[]
  ): Promise<{ components: Component[]; globalScopeHarmony: Harmony; legacyGlobalsSnapshot: LegacyGlobal[] }> {
    const globalScope = await LegacyScope.ensure(GLOBAL_SCOPE, 'global-scope');
    await globalScope.ensureDir();
    const legacyGlobalsSnapshot = this.bitApi.takeLegacyGlobalsSnapshot();
    const globalScopeHarmony = await this.bitApi.loadBit(globalScope.path);
    const scope = globalScopeHarmony.get<ScopeMain>(ScopeAspect.id);
    const aspectLoader = globalScopeHarmony.get<AspectLoaderMain>(AspectLoaderAspect.id);
    const ids = aspectIds.map((id) => ComponentID.fromString(id));
    const hasVersions = ids.every((id) => id.hasVersion());
    const useCache = hasVersions; // if all components has versions, try to use the cached aspects
    await scope.import(ids, { useCache, reason: 'to load aspects from global scope' });
    const components = await scope.getMany(ids, true);

    // don't use `await scope.loadAspectsFromCapsules(components, true);`
    // it won't work for globalScope because `this !== scope.aspectLoader` (this instance
    // is not the same as the aspectLoader instance Scope has)
    const resolvedAspects = await scope.getResolvedAspects(components, { workspaceName: 'global-scope' });
    try {
      await aspectLoader.loadRequireableExtensions(resolvedAspects, true);
    } catch (err: any) {
      if (err?.error?.code === 'MODULE_NOT_FOUND') {
        const resolvedAspectsAgain = await scope.getResolvedAspects(components, {
          skipIfExists: false,
          workspaceName: 'global-scope',
        });
        await aspectLoader.loadRequireableExtensions(resolvedAspectsAgain, true);
      } else {
        throw err;
      }
    }

    return { components, globalScopeHarmony, legacyGlobalsSnapshot };
  }

  /**
   * Get the generator aspect and the envs aspect from an harmony instance of the global scope
   */
  private async getGlobalGeneratorEnvs(
    aspectId: string
  ): Promise<{ remoteGenerator: GeneratorMain; fullAspectId: string; remoteEnvsAspect: EnvsMain; aspect: any }> {
    const { globalScopeHarmony, components, legacyGlobalsSnapshot } = await this.loadAspectsFromGlobalScope([aspectId]);
    const remoteGenerator = globalScopeHarmony.get<GeneratorMain>(GeneratorAspect.id);
    const remoteEnvsAspect = globalScopeHarmony.get<EnvsMain>(EnvsAspect.id);
    const aspect = components[0];
    const fullAspectId = aspect.id.toString();
    this.bitApi.restoreGlobalsFromSnapshot(legacyGlobalsSnapshot);

    return { remoteGenerator, fullAspectId, remoteEnvsAspect, aspect };
  }

  /**
   * in the case the aspect-id is given and this aspect doesn't exist locally, import it to the
   * global scope and load it from the capsule
   */
  async findWorkspaceTemplateInGlobalScope(
    aspectId: string,
    name?: string
  ): Promise<{ workspaceTemplate?: WorkspaceTemplate; aspect?: Component }> {
    const { remoteGenerator, fullAspectId, remoteEnvsAspect, aspect } = await this.getGlobalGeneratorEnvs(aspectId);
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
    const harmony = await this.bitApi.loadBit(workspacePath);
    let workspace: Workspace;
    try {
      workspace = harmony.get<Workspace>(WorkspaceAspect.id);
    } catch {
      throw new Error(`fatal: "${workspacePath}" is not a valid Bit workspace, make sure the path is correct`);
    }
    const aspectComponentId = await workspace.resolveComponentId(aspectId);
    await workspace.loadAspects([aspectId], true);
    const aspectComponent = await workspace.get(aspectComponentId);
    const aspectFullId = aspectComponentId.toString();
    const generator = harmony.get<GeneratorMain>(GeneratorAspect.id);
    const workspaceTemplate = await generator.searchRegisteredWorkspaceTemplate(name, aspectFullId);
    return { workspaceTemplate, aspect: aspectComponent };
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
      throw new BitError(
        `template "${name}" was not found, please use --aspect flag to load from an env i.e --aspect teambit.react/react-env\n Learn more about component templates here: https://bit.dev/reference/generator/create-generator`
      );
    }

    const { workspaceTemplate, aspect } = await this.findWorkspaceTemplateInGlobalScope(aspectId, name);
    if (workspaceTemplate) {
      return { workspaceTemplate, aspect };
    }
    throw new BitError(
      `template "${name}" was not found, please use --aspect flag to load from an env i.e --aspect teambit.react/react-env\n Learn more about component templates here: https://bit.dev/reference/generator/create-generator`
    );
  }

  async searchRegisteredWorkspaceTemplate(
    name?: string,
    aspectId?: string,
    remoteEnvsAspect?: EnvsMain
  ): Promise<WorkspaceTemplate | undefined> {
    let fromEnv;

    if (aspectId) {
      fromEnv = await this.listEnvWorkspaceTemplates(aspectId, remoteEnvsAspect);
    }
    const templates = fromEnv && fromEnv.length ? fromEnv : this.getAllWorkspaceTemplatesFlattened();
    const found = templates.find(({ id, template: tpl }) => {
      if (aspectId && name) return aspectId === id && name === tpl.name;
      if (aspectId) return aspectId === id;
      if (name) return name === tpl.name;
      throw new Error(`searchRegisteredWorkspaceTemplate expects to get "name" or "aspectId"`);
    });

    return found?.template;
  }

  async getTemplateWithId(templateName: string, aspect?: string): Promise<ComponentTemplateWithId> {
    const componentConfigLoadingRegistry = ComponentConfig.componentConfigLoadingRegistry;

    const templateWithId = await this.getComponentTemplate(templateName, aspect);

    ComponentConfig.componentConfigLoadingRegistry = componentConfigLoadingRegistry;

    if (!templateWithId) throw new BitError(`template "${templateName}" was not found`);
    return templateWithId;
  }

  async generateComponentTemplate(
    componentNames: string[],
    templateName: string,
    options: Partial<CreateOptions>,
    installOptions?: InstallOptions,
    promptResults?: PromptResults
  ): Promise<GenerateResult[]> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    await this.loadAspects();
    const { namespace, aspect } = options;

    const templateWithId = await this.getTemplateWithId(templateName, aspect);

    const componentIds = componentNames.map((componentName) =>
      this.newComponentHelper.getNewComponentId(componentName, namespace, options.scope)
    );

    const componentNameSameAsTemplateName = componentIds.find((componentId) => componentId.name === templateName);
    if (componentNameSameAsTemplateName) {
      const compNamePascal = camelCase(templateName, { pascalCase: true });
      throw new BitError(
        `unable to create a component with the same name as the template "${templateName}", please use a different name.
the reason is that after refactoring, the code will have this invalid class: "class ${compNamePascal} extends ${compNamePascal} {}"`
      );
    }

    const envId = await this.getEnvIdFromTemplateWithId(templateWithId);

    const componentGenerator = new ComponentGenerator(
      this.workspace,
      componentIds,
      options,
      templateWithId.template,
      this.envs,
      this.newComponentHelper,
      this.tracker,
      this.wsConfigFiles,
      this.logger,
      this.onComponentCreateSlot,
      templateWithId.id,
      envId,
      installOptions,
      promptResults
    );
    return componentGenerator.generate(options.force);
  }

  private async getEnvIdFromTemplateWithId(templateWithId: ComponentTemplateWithId): Promise<ComponentID | undefined> {
    const envIdFromTemplate = templateWithId.template.env;
    if (envIdFromTemplate) {
      const parsedFromTemplate = ComponentID.tryFromString(envIdFromTemplate);
      if (!parsedFromTemplate) {
        throw new BitError(
          `Error: unable to parse envId from template. template name: ${templateWithId.template.name}, envId: ${envIdFromTemplate}`
        );
      }
      const resolvedId = await this.workspace.resolveEnvIdWithPotentialVersionForConfig(parsedFromTemplate);
      return ComponentID.fromString(resolvedId);
    }
    if (templateWithId.envName) {
      return ComponentID.fromString(templateWithId.id);
    }
    return Promise.resolve(undefined);
  }

  async generateWorkspaceTemplate(
    workspaceName: string,
    templateName: string,
    options: NewOptions & { aspect?: string; currentDir?: boolean }
  ): Promise<GenerateWorkspaceTemplateResult> {
    if (this.workspace) {
      throw new BitError('Error: unable to generate a new workspace inside of an existing workspace');
    }
    const workspacePath = options.currentDir ? process.cwd() : resolve(workspaceName);
    if (!options.currentDir && fs.existsSync(workspacePath)) {
      throw new WorkspacePathExists(workspacePath);
    }
    const { aspect: aspectId, loadFrom } = options;
    const { workspaceTemplate, aspect } = loadFrom
      ? await this.findTemplateInOtherWorkspace(loadFrom, templateName, aspectId)
      : await this.getWorkspaceTemplate(templateName, aspectId);

    if (!workspaceTemplate) throw new BitError(`template "${templateName}" was not found`);
    const workspaceGenerator = new WorkspaceGenerator(
      workspaceName,
      workspacePath,
      options,
      workspaceTemplate,
      this.bitApi,
      aspect
    );
    await this.warnAboutDeprecation(aspect);
    await workspaceGenerator.generate();
    return { workspacePath, appName: workspaceTemplate.appName };
  }

  private async warnAboutDeprecation(aspect?: Component) {
    if (!aspect) return;
    const deprecationInfo = await this.deprecation.getDeprecationInfo(aspect);
    if (deprecationInfo.isDeprecate) {
      const newStarterMsg = deprecationInfo.newId ? `, use "${deprecationInfo.newId.toString()}" instead` : '';
      this.logger.consoleWarning(`the starter "${aspect?.id.toString()}" is deprecated${newStarterMsg}`);
    }
  }

  private async getAllComponentTemplatesDescriptorsFlattened(aspectId?: string): Promise<Array<TemplateDescriptor>> {
    const envTemplates = await this.listEnvComponentTemplateDescriptors([], aspectId);
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
      const resolvedComponentTemplates = Array.isArray(componentTemplates) ? componentTemplates : componentTemplates();
      return resolvedComponentTemplates.map((template) => ({
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
  async listEnvWorkspaceTemplates(envId: string, remoteEnvsAspect?: EnvsMain): Promise<Array<WorkspaceTemplateWithId>> {
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
  async listEnvComponentTemplateDescriptors(ids: string[] = [], aspectId?: string): Promise<TemplateDescriptor[]> {
    const envTemplates = await this.listEnvComponentTemplates(ids, aspectId);
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

  getConfiguredEnvs(): string[] {
    return this.config.envs ?? [];
  }

  async listEnvComponentTemplates(ids: string[] = [], aspectId?: string): Promise<Array<ComponentTemplateWithId>> {
    const configEnvs = this.config.envs || [];
    let remoteEnvsAspect;
    let fullAspectId;
    if (aspectId && !configEnvs.includes(aspectId)) {
      const globals = await this.getGlobalGeneratorEnvs(aspectId);
      remoteEnvsAspect = globals.remoteEnvsAspect;
      fullAspectId = globals.fullAspectId;
    }
    const allIds = uniq(configEnvs?.concat(ids).concat([aspectId, fullAspectId]).filter(Boolean));
    const envs = await this.loadEnvs(allIds, remoteEnvsAspect);
    const templates = envs.flatMap((env) => {
      if (!env.env.getGeneratorTemplates) return [];
      const tpls = env.env.getGeneratorTemplates() || [];
      const componentId = ComponentID.fromString(env.id);
      return tpls.map((template) => {
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
    if (!remoteEnvsAspect) {
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

  static slots = [
    Slot.withType<ComponentTemplate[]>(),
    Slot.withType<WorkspaceTemplate[]>(),
    Slot.withType<OnComponentCreateFn>(),
  ];

  static dependencies = [
    WorkspaceAspect,
    CLIAspect,
    GraphqlAspect,
    EnvsAspect,
    AspectLoaderAspect,
    NewComponentHelperAspect,
    ComponentAspect,
    TrackerAspect,
    LoggerAspect,
    GitAspect,
    WorkspaceConfigFilesAspect,
    DeprecationAspect,
  ];

  static runtime = MainRuntime;

  static async provider(
    [
      workspace,
      cli,
      graphql,
      envs,
      aspectLoader,
      newComponentHelper,
      componentAspect,
      tracker,
      loggerMain,
      git,
      wsConfigFiles,
      deprecation,
    ]: [
      Workspace,
      CLIMain,
      GraphqlMain,
      EnvsMain,
      AspectLoaderMain,
      NewComponentHelperMain,
      ComponentMain,
      TrackerMain,
      LoggerMain,
      GitMain,
      WorkspaceConfigFilesMain,
      DeprecationMain,
    ],
    config: GeneratorConfig,
    [componentTemplateSlot, workspaceTemplateSlot, onComponentCreateSlot]: [
      ComponentTemplateSlot,
      WorkspaceTemplateSlot,
      OnComponentCreateSlot,
    ]
  ) {
    const logger = loggerMain.createLogger(GeneratorAspect.id);
    const generator = new GeneratorMain(
      componentTemplateSlot,
      workspaceTemplateSlot,
      onComponentCreateSlot,
      config,
      workspace,
      envs,
      aspectLoader,
      newComponentHelper,
      componentAspect,
      tracker,
      logger,
      git,
      wsConfigFiles,
      deprecation
    );
    const commands = [new CreateCmd(generator), new TemplatesCmd(generator), new NewCmd(generator)];
    cli.register(...commands);
    graphql.register(() => generatorSchema(generator));
    aspectLoader.registerPlugins([new StarterPlugin(generator)]);
    envs.registerService(new GeneratorService());

    if (generator)
      generator.registerComponentTemplate(() => [
        componentGeneratorTemplate,
        componentGeneratorTemplateStandalone,
        starterTemplate,
        starterTemplateStandalone,
      ]);
    generator.registerWorkspaceTemplate([BasicWorkspaceStarter]);

    return generator;
  }
}

GeneratorAspect.addRuntime(GeneratorMain);
