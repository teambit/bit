import { AspectLoaderAspect, AspectLoaderMain } from '@teambit/aspect-loader';
import mergeDeepLeft from 'ramda/src/mergeDeepLeft';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { compact } from 'lodash';
import { EnvPolicyConfigObject } from '@teambit/dependency-resolver';
import { BitError } from '@teambit/bit-error';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Environment, EnvsAspect, EnvsMain, EnvTransformer } from '@teambit/envs';
import { ReactAspect, ReactMain } from '@teambit/react';
import { GeneratorAspect, GeneratorMain } from '@teambit/generator';
import { BabelAspect, BabelMain } from '@teambit/babel';
import { ComponentID } from '@teambit/component-id';
import { AspectList } from '@teambit/component';
import WorkspaceAspect, { ExtensionsOrigin, Workspace } from '@teambit/workspace';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import { AspectAspect } from './aspect.aspect';
import { AspectEnv } from './aspect.env';
import { CoreExporterTask } from './core-exporter.task';
import { aspectTemplate } from './templates/aspect';
import { babelConfig } from './babel/babel-config';
import { AspectCmd, GetAspectCmd, ListAspectCmd, SetAspectCmd, UnsetAspectCmd, UpdateAspectCmd } from './aspect.cmd';

export type AspectSource = { aspectName: string; source: string; level: string };

const tsconfig = require('./typescript/tsconfig.json');

export class AspectMain {
  constructor(readonly aspectEnv: AspectEnv, private envs: EnvsMain, private workspace: Workspace) {}

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
    config: Record<string, any> = {}
  ): Promise<ComponentID[]> {
    const componentIds = await this.workspace.idsByPattern(pattern);
    await Promise.all(
      componentIds.map(async (componentId) => {
        await this.workspace.addSpecificComponentConfig(componentId, aspectId, config);
      })
    );
    await this.workspace.bitMap.write();

    return componentIds;
  }

  async unsetAspectsFromComponents(pattern: string, aspectId: string): Promise<ComponentID[]> {
    const componentIds = await this.workspace.idsByPattern(pattern);
    await Promise.all(
      componentIds.map(async (componentId) => {
        await this.workspace.removeSpecificComponentConfig(componentId, aspectId, true);
      })
    );
    await this.workspace.bitMap.write();

    return componentIds;
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

  async updateAspectsToComponents(aspectId: string, pattern?: string): Promise<ComponentID[]> {
    let aspectCompId = await this.workspace.resolveComponentId(aspectId);
    if (!aspectCompId.hasVersion()) {
      try {
        const fromRemote = await this.workspace.scope.getRemoteComponent(aspectCompId);
        aspectCompId = aspectCompId.changeVersion(fromRemote.id.version);
      } catch (err) {
        throw new BitError(
          `unable to find ${aspectId} in the remote. if this is a local aspect, please provide a version with your aspect (${aspectId}) to update to`
        );
      }
    }
    const allCompIds = pattern ? await this.workspace.idsByPattern(pattern) : await this.workspace.listIds();
    const allComps = await this.workspace.getMany(allCompIds);
    const updatedComponentIds = await Promise.all(
      allComps.map(async (comp) => {
        const aspect = comp.state.aspects.get(aspectCompId.toStringWithoutVersion());
        if (!aspect) return undefined;
        if (aspect.id.version === aspectCompId.version) return undefined; // nothing to update
        // don't mark with minus if not exist in .bitmap. it's not needed. when the component is loaded, the
        // merge-operation of the aspects removes duplicate aspect-id with different versions.
        await this.workspace.removeSpecificComponentConfig(comp.id, aspect.id.toString(), false);
        await this.workspace.addSpecificComponentConfig(comp.id, aspectCompId.toString(), aspect.config);
        return comp.id;
      })
    );
    await this.workspace.bitMap.write();
    return compact(updatedComponentIds);
  }

  /**
   * override the dependency configuration of the component environment.
   */
  overrideDependencies(dependencyPolicy: EnvPolicyConfigObject) {
    return this.envs.override({
      getDependencies: async () => {
        const reactDeps = await this.aspectEnv.getDependencies();
        return mergeDeepLeft(dependencyPolicy, reactDeps);
      },
    });
  }

  static runtime = MainRuntime;
  static dependencies = [
    ReactAspect,
    EnvsAspect,
    BuilderAspect,
    AspectLoaderAspect,
    CompilerAspect,
    BabelAspect,
    GeneratorAspect,
    WorkspaceAspect,
    CLIAspect,
  ];

  static async provider([react, envs, builder, aspectLoader, compiler, babel, generator, workspace, cli]: [
    ReactMain,
    EnvsMain,
    BuilderMain,
    AspectLoaderMain,
    CompilerMain,
    BabelMain,
    GeneratorMain,
    Workspace,
    CLIMain
  ]) {
    const babelCompiler = babel.createCompiler({
      babelTransformOptions: babelConfig,
      distDir: 'dist',
      distGlobPatterns: [`dist/**`, `!dist/**/*.d.ts`, `!dist/tsconfig.tsbuildinfo`],
    });
    const compilerOverride = envs.override({
      getCompiler: () => {
        return babelCompiler;
      },
    });

    const transformer = (config) => {
      config
        .mergeTsConfig(tsconfig)
        .setArtifactName('declaration')
        .setDistGlobPatterns([`dist/**/*.d.ts`])
        .setShouldCopyNonSupportedFiles(false);
      return config;
    };
    const tsCompiler = react.env.getCjsCompilerTask([transformer]);

    const compilerTasksOverride = react.overrideCompilerTasks([
      compiler.createTask('BabelCompiler', babelCompiler),
      tsCompiler,
    ]);

    const aspectEnv = react.compose(
      [compilerOverride, compilerTasksOverride],
      new AspectEnv(react.reactEnv, aspectLoader)
    );

    const coreExporterTask = new CoreExporterTask(aspectEnv, aspectLoader);
    if (!__dirname.includes('@teambit/bit')) {
      builder.registerBuildTasks([coreExporterTask]);
    }

    envs.registerEnv(aspectEnv);
    generator.registerComponentTemplate([aspectTemplate]);
    const aspectMain = new AspectMain(aspectEnv as AspectEnv, envs, workspace);
    const aspectCmd = new AspectCmd();
    aspectCmd.commands = [
      new ListAspectCmd(aspectMain),
      new GetAspectCmd(aspectMain),
      new SetAspectCmd(aspectMain),
      new UnsetAspectCmd(aspectMain),
      new UpdateAspectCmd(aspectMain),
    ];
    cli.register(aspectCmd);

    return aspectMain;
  }
}

AspectAspect.addRuntime(AspectMain);
