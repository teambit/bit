import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { EnvsAspect, EnvsMain } from '@teambit/environments';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { BitId } from 'bit-bin/dist/bit-id';

import { CompilerAspect } from './compiler.aspect';
import { CompileCmd } from './compiler.cmd';
import { CompilerTask } from './compiler.task';
import { WorkspaceCompiler } from './workspace-compiler';

export class CompilerMain {
  static runtime = MainRuntime;
  static dependencies = [CLIAspect, WorkspaceAspect, EnvsAspect];
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
  static async provider([cli, workspace, envs]: [CLIMain, Workspace, EnvsMain]) {
    const compilerTask = new CompilerTask(CompilerAspect.id);
    const workspaceCompiler = new WorkspaceCompiler(workspace, envs);
    const compilerMain = new CompilerMain(workspaceCompiler, compilerTask);
    cli.register(new CompileCmd(workspaceCompiler));
    return compilerMain;
  }
}

CompilerAspect.addRuntime(CompilerMain);
