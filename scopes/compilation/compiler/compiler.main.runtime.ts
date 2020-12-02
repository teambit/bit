import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { PubsubAspect, PubsubMain } from '@teambit/pubsub';
import AspectLoaderAspect, { AspectLoaderMain } from '@teambit/aspect-loader';
import { Component } from '@teambit/component';
import { BitId } from 'bit-bin/dist/bit-id';
import { CompilerService } from './compiler.service';
import { CompilerAspect } from './compiler.aspect';
import { CompileCmd } from './compiler.cmd';
import { CompilerTask } from './compiler.task';
import { Compiler } from './types';
import { WorkspaceCompiler } from './workspace-compiler';

export class CompilerMain {
  constructor(private pubsub: PubsubMain, private workspaceCompiler: WorkspaceCompiler, private envs: EnvsMain) {}

  compileOnWorkspace(
    componentsIds: string[] | BitId[], // when empty, it compiles all
    options: {
      noCache?: boolean;
      verbose?: boolean;
    }
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

  static runtime = MainRuntime;

  static dependencies = [CLIAspect, WorkspaceAspect, EnvsAspect, LoggerAspect, PubsubAspect, AspectLoaderAspect];

  static async provider([cli, workspace, envs, loggerMain, pubsub, aspectLoader]: [
    CLIMain,
    Workspace,
    EnvsMain,
    LoggerMain,
    PubsubMain,
    AspectLoaderMain
  ]) {
    const workspaceCompiler = new WorkspaceCompiler(workspace, envs, pubsub, aspectLoader);
    envs.registerService(new CompilerService());
    const compilerMain = new CompilerMain(pubsub, workspaceCompiler, envs);
    const logger = loggerMain.createLogger(CompilerAspect.id);
    cli.register(new CompileCmd(workspaceCompiler, logger, pubsub));
    return compilerMain;
  }
}

CompilerAspect.addRuntime(CompilerMain);
