import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { EnvsAspect, EnvsMain } from '@teambit/environments';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { BitId } from 'bit-bin/dist/bit-id';

import { CompilerAspect } from './compiler.aspect';
import { CompileCmd } from './compiler.cmd';
import { CompilerTask } from './compiler.task';
import { Compiler } from './types';
import { WorkspaceCompiler } from './workspace-compiler';

export class CompilerMain {
  constructor(private workspaceCompiler: WorkspaceCompiler, readonly task: CompilerTask) {}
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
  static async provider([cli, workspace, envs, loggerMain]: [CLIMain, Workspace, EnvsMain, LoggerMain]) {
    const compilerTask = new CompilerTask(CompilerAspect.id);
    const workspaceCompiler = new WorkspaceCompiler(workspace, envs);
    const compilerMain = new CompilerMain(workspaceCompiler, compilerTask);
    const logger = loggerMain.createLogger(CompilerAspect.id);
    cli.register(new CompileCmd(workspaceCompiler, logger));
    return compilerMain;
  }

  static runtime = MainRuntime;
  static dependencies = [CLIAspect, WorkspaceAspect, EnvsAspect, LoggerAspect];
}

CompilerAspect.addRuntime(CompilerMain);
