import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { PubsubAspect, PubsubMain } from '@teambit/pubsub';
import AspectLoaderAspect, { AspectLoaderMain } from '@teambit/aspect-loader';
import { Component } from '@teambit/component';
import { BitId } from '@teambit/legacy-bit-id';
import { BuilderMain } from '@teambit/builder';

import ManyComponentsWriter from '@teambit/legacy/dist/consumer/component-ops/many-components-writer';
import { CompilerService } from './compiler.service';
import { CompilerAspect } from './compiler.aspect';
import { CompileCmd } from './compiler.cmd';
import { CompilerTask } from './compiler.task';
import { Compiler } from './types';
import { CompileOptions, WorkspaceCompiler } from './workspace-compiler';
import { DistArtifact } from './dist-artifact';
import { DistArtifactNotFound } from './exceptions';

export class CompilerMain {
  constructor(
    private pubsub: PubsubMain,
    private workspaceCompiler: WorkspaceCompiler,
    private envs: EnvsMain,
    private builder: BuilderMain
  ) {}

  compileOnWorkspace(
    componentsIds: string[] | BitId[], // when empty, it compiles all
    options: CompileOptions = {}
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
    const compilerInstance: Compiler = environment.getCompiler?.();
    if (!compilerInstance) return null;
    return compilerInstance.getDistPathBySrcPath(srcPath);
  }

  async getDistsFiles(component: Component): Promise<DistArtifact> {
    const artifacts = await this.builder.getArtifactsVinylByExtension(component, CompilerAspect.id);
    if (!artifacts.length) throw new DistArtifactNotFound(component.id);

    return new DistArtifact(artifacts);
  }

  static runtime = MainRuntime;

  static dependencies = [CLIAspect, WorkspaceAspect, EnvsAspect, LoggerAspect, PubsubAspect, AspectLoaderAspect];

  static async provider([cli, workspace, envs, loggerMain, pubsub, aspectLoader, builder]: [
    CLIMain,
    Workspace,
    EnvsMain,
    LoggerMain,
    PubsubMain,
    AspectLoaderMain,
    BuilderMain
  ]) {
    const workspaceCompiler = new WorkspaceCompiler(workspace, envs, pubsub, aspectLoader);
    envs.registerService(new CompilerService());
    const compilerMain = new CompilerMain(pubsub, workspaceCompiler, envs, builder);
    const logger = loggerMain.createLogger(CompilerAspect.id);
    cli.register(new CompileCmd(workspaceCompiler, logger, pubsub));

    ManyComponentsWriter.externalCompiler = compilerMain.compileOnWorkspace.bind(compilerMain);

    return compilerMain;
  }
}

CompilerAspect.addRuntime(CompilerMain);
