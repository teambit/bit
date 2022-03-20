import AspectLoaderAspect, { AspectLoaderMain } from '@teambit/aspect-loader';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Component, ComponentID } from '@teambit/component';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { BitId } from '@teambit/legacy-bit-id';

import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import ManyComponentsWriter from '@teambit/legacy/dist/consumer/component-ops/many-components-writer';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { GeneratorAspect, GeneratorMain } from '@teambit/generator';
import { PubsubAspect, PubsubMain } from '@teambit/pubsub';
import UIAspect, { UiMain } from '@teambit/ui';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { CompilerAspect } from './compiler.aspect';
import { CompileCmd } from './compiler.cmd';
import { CompilerService } from './compiler.service';
import { CompilerTask } from './compiler.task';
import { DistArtifact } from './dist-artifact';
import { DistArtifactNotFound } from './exceptions';
import { CompilationInitiator, Compiler } from './types';
import { CompileOptions, WorkspaceCompiler } from './workspace-compiler';
import { compilerTemplate } from './templates/compiler';

export class CompilerMain {
  constructor(
    private pubsub: PubsubMain,
    private workspaceCompiler: WorkspaceCompiler,
    private envs: EnvsMain,
    private builder: BuilderMain
  ) {}

  /**
   * Run compilation on `bit new` and when new components are imported
   */
  compileOnWorkspace(
    componentsIds: string[] | BitId[] | ComponentID[] = [], // when empty, it compiles all
    options: CompileOptions = { initiator: CompilationInitiator.ComponentAdded }
  ) {
    return this.workspaceCompiler.compileComponents(componentsIds, options);
  }
  /**
   * API to create a new compiler task, it facilitates the usage of multiple compilers.
   * with this method you can create any number of compilers and add them to the buildPipeline.
   */
  createTask(name: string, compiler: Compiler): CompilerTask {
    return new CompilerTask(CompilerAspect.id, name, compiler);
  }

  /**
   * find the compiler configured on the workspace and ask for the dist path.
   */
  getDistPathBySrcPath(component: Component, srcPath: string): string | null {
    const environment = this.envs.getEnv(component).env;
    const compilerInstance = environment.getCompiler?.();
    if (!compilerInstance) return null;
    return compilerInstance.getDistPathBySrcPath(srcPath);
  }

  async getDistsFiles(component: Component): Promise<DistArtifact> {
    const artifacts = await this.builder.getArtifactsVinylByExtension(component, CompilerAspect.id);
    if (!artifacts.length) throw new DistArtifactNotFound(component.id);

    return new DistArtifact(artifacts);
  }

  static runtime = MainRuntime;

  static dependencies = [
    CLIAspect,
    WorkspaceAspect,
    EnvsAspect,
    LoggerAspect,
    PubsubAspect,
    AspectLoaderAspect,
    BuilderAspect,
    UIAspect,
    GeneratorAspect,
    DependencyResolverAspect,
  ];

  static async provider([
    cli,
    workspace,
    envs,
    loggerMain,
    pubsub,
    aspectLoader,
    builder,
    ui,
    generator,
    dependencyResolver,
  ]: [
    CLIMain,
    Workspace,
    EnvsMain,
    LoggerMain,
    PubsubMain,
    AspectLoaderMain,
    BuilderMain,
    UiMain,
    GeneratorMain,
    DependencyResolverMain
  ]) {
    const logger = loggerMain.createLogger(CompilerAspect.id);
    const workspaceCompiler = new WorkspaceCompiler(
      workspace,
      envs,
      pubsub,
      aspectLoader,
      ui,
      logger,
      dependencyResolver
    );
    envs.registerService(new CompilerService());
    const compilerMain = new CompilerMain(pubsub, workspaceCompiler, envs, builder);
    cli.register(new CompileCmd(workspaceCompiler, logger, pubsub));
    generator.registerComponentTemplate([compilerTemplate]);
    ManyComponentsWriter.externalCompiler = compilerMain.compileOnWorkspace.bind(compilerMain);

    return compilerMain;
  }
}

CompilerAspect.addRuntime(CompilerMain);
