import { CompilerAspect } from './compiler.aspect';
import { MainRuntime, CLIAspect } from '../cli/cli.aspect';
import { WorkspaceAspect } from '../workspace';
import { Workspace } from '../workspace';
import { CLIMain } from '../cli';
import { CompileCmd } from './compiler.cmd';
import { WorkspaceCompiler } from './workspace-compiler';
import { CompilerTask } from './compiler.task';
import { Extensions } from '../../constants';
import { BitId } from '../../bit-id';
import { EnvsAspect, EnvsMain } from '../environments';

export class CompilerMain {
  static id = Extensions.compiler;
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
    const compilerTask = new CompilerTask(CompilerMain.id);
    const workspaceCompiler = new WorkspaceCompiler(workspace, envs);
    const compilerMain = new CompilerMain(workspaceCompiler, compilerTask);
    cli.register(new CompileCmd(workspaceCompiler));
    return compilerMain;
  }
}

CompilerAspect.addRuntime(CompilerMain);
