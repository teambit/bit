import { Harmony } from '@teambit/harmony';
import { AspectLoaderAspect, AspectLoaderMain } from '@teambit/aspect-loader';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { compact, merge } from 'lodash';
import { DependencyResolverAspect, DependencyResolverMain, EnvPolicyConfigObject } from '@teambit/dependency-resolver';
import { BitError } from '@teambit/bit-error';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { EnvContext, Environment, EnvsAspect, EnvsMain, EnvTransformer } from '@teambit/envs';
import { ReactAspect, ReactEnv, ReactMain } from '@teambit/react';
import { GeneratorAspect, GeneratorMain } from '@teambit/generator';
import { ComponentID } from '@teambit/component-id';
import { AspectList } from '@teambit/component';
import { WorkerAspect, WorkerMain } from '@teambit/worker';
import { WorkspaceAspect, ExtensionsOrigin, Workspace } from '@teambit/workspace';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import { AspectAspect } from './aspect.aspect';
import { AspectEnv } from './aspect.env';
import { CoreExporterTask } from './core-exporter.task';
import { babelConfig } from './babel/babel-config';
import {
  AspectCmd,
  GetAspectCmd,
  ListAspectCmd,
  ListCoreAspectCmd,
  SetAspectCmd,
  SetAspectOptions,
  UnsetAspectCmd,
  UpdateAspectCmd,
} from './aspect.cmd';
import { getTemplates } from './aspect.templates';
import { DevFilesAspect, DevFilesMain } from '@teambit/dev-files';
import { ExtensionDataList, ValidateBeforePersistResult } from '@teambit/legacy.extension-data';

export type AspectSource = { aspectName: string; source: string; level: string };

export class AspectMain {
  constructor(
    readonly aspectEnv: AspectEnv,
    private envs: EnvsMain,
    private workspace: Workspace,
    private aspectLoader: AspectLoaderMain,
    private depsResolver: DependencyResolverMain
  ) {}

  /**
   * compose your own aspect environment.
   */
  compose(transformers: EnvTransformer[] = [], targetEnv: Environment = {}) {
    return this.envs.compose(this.envs.merge(targetEnv, this.aspectEnv), transformers);
  }

  async listAspectsOfComponent(pattern?: string): Promise<{ [component: string]: AspectSource[] }> {
    const getIds = async () => {
      if (!pattern) return this.workspace.listIds();
      return this.workspace.idsByPattern(pattern);
    };
    const componentIds = await getIds();
    const results = {};
    await Promise.all(
      componentIds.map(async (id) => {
        const aspectSources = await this.getAspectNamesForComponent(id);
        results[id.toString()] = aspectSources;
      })
    );
    return results;
  }

  listCoreAspects(): string[] {
    return this.aspectLoader.getCoreAspectIds();
  }

  get babelConfig() {
    return babelConfig;
  }

  private async getAspectNamesForComponent(id: ComponentID): Promise<AspectSource[]> {
    const componentFromScope = await this.workspace.scope.get(id);
    const { beforeMerge } = await this.workspace.componentExtensions(id, componentFromScope);
    const aspectSources: AspectSource[] = [];
    beforeMerge.forEach((source) => {
      source.extensions.forEach((ext) => {
        const aspectName = ext.name || ext.extensionId?.toString() || '<no-name>';
        const alreadySaved = aspectSources.find((_) => _.aspectName === aspectName);
        if (alreadySaved) return;
        aspectSources.push({ aspectName, source: source.origin, level: this.getLevelBySourceOrigin(source.origin) });
      });
    });
    return aspectSources;
  }

  private getLevelBySourceOrigin(origin: ExtensionsOrigin) {
    switch (origin) {
      case 'BitmapFile':
      case 'ComponentJsonFile':
      case 'ModelSpecific':
        return 'component';
      default:
        return 'workspace';
    }
  }

  async setAspectsToComponents(
    pattern: string,
    aspectId: string,
    config: Record<string, any> = {},
    options: SetAspectOptions = {}
  ): Promise<ComponentID[]> {
    const componentIds = await this.workspace.idsByPattern(pattern);
    await Promise.all(
      componentIds.map(async (componentId) => {
        await this.workspace.addSpecificComponentConfig(componentId, aspectId, config, {
          shouldMergeWithExisting: options.merge,
        });
      })
    );
    await this.workspace.bitMap.write(`aspect-set (${aspectId})`);

    return componentIds;
  }

  async unsetAspectsFromComponents(pattern: string, aspectIdStr: string): Promise<ComponentID[]> {
    const componentIds = await this.workspace.idsByPattern(pattern);
    const aspectId = await this.workspace.resolveComponentId(aspectIdStr);
    const components = await this.workspace.getMany(componentIds);
    const updatedCompIds: ComponentID[] = [];
    await Promise.all(
      components.map(async (component) => {
        const existAspect = component.state.aspects.get(aspectId.toStringWithoutVersion());
        if (!existAspect) return;
        await this.workspace.removeSpecificComponentConfig(component.id, existAspect.id.toString(), true);
        updatedCompIds.push(component.id);
      })
    );
    await this.workspace.bitMap.write(`aspect-unset (${aspectId})`);
    return updatedCompIds;
  }

  /**
   * returns all aspects info of a component, include the config and the data.
   */
  async getAspectsOfComponent(id: string | ComponentID): Promise<AspectList> {
    if (typeof id === 'string') {
      id = await this.workspace.resolveComponentId(id);
    }
    const component = await this.workspace.get(id);
    return component.state.aspects;
  }

  /**
   * helps debugging why/how an aspect was set to a component
   */
  async getAspectsOfComponentForDebugging(id: string | ComponentID) {
    if (typeof id === 'string') {
      id = await this.workspace.resolveComponentId(id);
    }
    const componentFromScope = await this.workspace.scope.get(id);
    const { extensions, beforeMerge } = await this.workspace.componentExtensions(id, componentFromScope);
    const component = await this.workspace.get(id);
    return {
      aspects: component.state.aspects,
      extensions,
      beforeMerge,
    };
  }

  async updateAspectsToComponents(
    aspectId: string,
    pattern?: string
  ): Promise<{ updated: ComponentID[]; alreadyUpToDate: ComponentID[] }> {
    let aspectCompId = await this.workspace.resolveComponentId(aspectId);
    if (!aspectCompId.hasVersion()) {
      try {
        const fromRemote = await this.workspace.scope.getRemoteComponent(aspectCompId);
        aspectCompId = aspectCompId.changeVersion(fromRemote.id.version);
      } catch {
        throw new BitError(
          `unable to find ${aspectId} in the remote. if this is a local aspect, please provide a version with your aspect (${aspectId}) to update to`
        );
      }
    }
    const allCompIds = pattern ? await this.workspace.idsByPattern(pattern) : this.workspace.listIds();
    const allComps = await this.workspace.getMany(allCompIds);
    const alreadyUpToDate: ComponentID[] = [];
    const updatedComponentIds = await Promise.all(
      allComps.map(async (comp) => {
        const aspect = comp.state.aspects.get(aspectCompId.toStringWithoutVersion());
        if (!aspect) return undefined;
        if (aspect.id.version === aspectCompId.version) {
          // nothing to update
          alreadyUpToDate.push(comp.id);
          return undefined;
        }
        // don't mark with minus if not exist in .bitmap. it's not needed. when the component is loaded, the
        // merge-operation of the aspects removes duplicate aspect-id with different versions.
        await this.workspace.removeSpecificComponentConfig(comp.id, aspect.id.toString(), false);
        await this.workspace.addSpecificComponentConfig(comp.id, aspectCompId.toString(), aspect.config);
        return comp.id;
      })
    );
    await this.workspace.bitMap.write(`aspect-update (${aspectCompId})`);
    return { updated: compact(updatedComponentIds), alreadyUpToDate };
  }

  /**
   * override the dependency configuration of the component environment.
   */
  overrideDependencies(dependencyPolicy: EnvPolicyConfigObject) {
    return this.envs.override({
      getDependencies: async () => {
        const reactDeps = await this.aspectEnv.getDependencies();
        return merge(reactDeps, dependencyPolicy);
      },
    });
  }

  /**
   * currently, it validates envs/envs only. If needed for other aspects, create a slot, let aspects register to it,
   * then call the validation of all aspects from here.
   */
  validateAspectsBeforePersist(extensionDataList: ExtensionDataList): ValidateBeforePersistResult {
    const envExt = extensionDataList.findCoreExtension(EnvsAspect.id);
    if (envExt) {
      const result = this.envs.validateEnvId(envExt);
      if (result) return result;
    }
    const depResolverExt = extensionDataList.findCoreExtension(DependencyResolverAspect.id);
    if (depResolverExt) {
      const result = this.depsResolver.validateAspectData(depResolverExt.data as any);
      if (result) return result;
    }
  }

  static runtime = MainRuntime;
  static dependencies = [
    ReactAspect,
    EnvsAspect,
    BuilderAspect,
    AspectLoaderAspect,
    CompilerAspect,
    GeneratorAspect,
    WorkspaceAspect,
    CLIAspect,
    LoggerAspect,
    WorkerAspect,
    DevFilesAspect,
    DependencyResolverAspect,
  ];

  static async provider(
    [
      react,
      envs,
      builder,
      aspectLoader,
      compiler,
      generator,
      workspace,
      cli,
      loggerMain,
      workerMain,
      devFilesMain,
      depResolver,
    ]: [
      ReactMain,
      EnvsMain,
      BuilderMain,
      AspectLoaderMain,
      CompilerMain,
      GeneratorMain,
      Workspace,
      CLIMain,
      LoggerMain,
      WorkerMain,
      DevFilesMain,
      DependencyResolverMain,
    ],
    config,
    slots,
    harmony: Harmony
  ) {
    const logger = loggerMain.createLogger(AspectAspect.id);

    const aspectEnv = envs.merge<AspectEnv, ReactEnv>(
      new AspectEnv(react.reactEnv, aspectLoader, devFilesMain, compiler, workerMain, logger),
      react.reactEnv
    );

    const coreExporterTask = new CoreExporterTask(aspectEnv, aspectLoader);
    if (!__dirname.includes('@teambit/bit')) {
      builder.registerBuildTasks([coreExporterTask]);
    }

    envs.registerEnv(aspectEnv);
    if (generator) {
      const envContext = new EnvContext(ComponentID.fromString(ReactAspect.id), loggerMain, workerMain, harmony);
      generator.registerComponentTemplate(() => getTemplates(envContext));
    }
    const aspectMain = new AspectMain(aspectEnv as AspectEnv, envs, workspace, aspectLoader, depResolver);
    const aspectCmd = new AspectCmd();
    aspectCmd.commands = [
      new ListAspectCmd(aspectMain),
      new ListCoreAspectCmd(aspectMain),
      new GetAspectCmd(aspectMain),
      new SetAspectCmd(aspectMain),
      new UnsetAspectCmd(aspectMain),
      new UpdateAspectCmd(aspectMain),
    ];
    cli.register(aspectCmd);

    ExtensionDataList.validateBeforePersistHook = aspectMain.validateAspectsBeforePersist.bind(aspectMain);

    return aspectMain;
  }
}

AspectAspect.addRuntime(AspectMain);
