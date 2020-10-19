import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { EnvsAspect, EnvsMain } from '@teambit/environments';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { PubsubAspect, PubsubMain } from '@teambit/pubsub';

import { BitId } from 'bit-bin/dist/bit-id';
import { CompilerService } from './compiler.service';
import { CompilerAspect } from './compiler.aspect';
import { CompileCmd } from './compiler.cmd';
import { CompilerTask } from './compiler.task';
import { Compiler } from './types';
import { WorkspaceCompiler } from './workspace-compiler';

export class CompilerMain {
  constructor(private pubsub: PubsubMain, private workspaceCompiler: WorkspaceCompiler, readonly task: CompilerTask) {}

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
  createTask(compiler: Compiler) {
    return new CompilerTask(CompilerAspect.id, compiler);
  }

  static runtime = MainRuntime;

  static dependencies = [CLIAspect, WorkspaceAspect, EnvsAspect, LoggerAspect, PubsubAspect];

  static async provider([cli, workspace, envs, loggerMain, pubsub]: [
    CLIMain,
    Workspace,
    EnvsMain,
    LoggerMain,
    PubsubMain
  ]) {
    const compilerTask = new CompilerTask(CompilerAspect.id);
    const workspaceCompiler = new WorkspaceCompiler(workspace, envs, pubsub);
    envs.registerService(new CompilerService());
    const compilerMain = new CompilerMain(pubsub, workspaceCompiler, compilerTask);
    const logger = loggerMain.createLogger(CompilerAspect.id);
    cli.register(new CompileCmd(workspaceCompiler, logger));
    return compilerMain;
  }
}

CompilerAspect.addRuntime(CompilerMain);
