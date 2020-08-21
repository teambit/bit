import { CompilerAspect } from './compiler.aspect';
import { MainRuntime, CLIAspect } from '@teambit/cli';
import { WorkspaceAspect } from '@teambit/workspace';
import { Workspace } from '@teambit/workspace';
import { CLIMain } from '@teambit/cli';
import { CompileCmd } from './compiler.cmd';
import { WorkspaceCompiler } from './workspace-compiler';
import { CompilerTask } from './compiler.task';
import { BitId } from 'bit-bin/dist/bit-id';
import { EnvsAspect, EnvsMain } from '@teambit/environments';

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
