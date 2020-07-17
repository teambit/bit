import { WorkspaceExt } from '../workspace';
import { Environments } from '../environments';
import { Workspace } from '../workspace';
import { CLIExtension } from '../cli';
import { CompileCmd } from './compiler.cmd';
import { Compile } from './compile';
import { CompilerTask } from './compiler.task';
import { Extensions } from '../../constants';

export class CompilerExtension {
  static id = Extensions.compiler;
  static dependencies = [CLIExtension, WorkspaceExt, Environments];
  static async provider([cli, workspace, envs]: [CLIExtension, Workspace, Environments]) {
    const compilerTask = new CompilerTask(CompilerExtension.id);
    const compile = new Compile(workspace, envs, compilerTask);
    cli.register(new CompileCmd(compile));
    return compile;
  }
}
