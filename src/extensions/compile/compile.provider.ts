import { Workspace } from '../workspace';
import { CompileCmd } from './compile.cmd';
import { Compile } from './compile';
import { Environments } from '../environments';
import { CompileTask } from './compile.task';
import { CLIExtension } from '../cli';

export type CompileDeps = [CLIExtension, Workspace, Environments];

export async function provideCompile([cli, workspace, envs]: CompileDeps) {
  const compilerTask = new CompileTask(workspace);
  const compile = new Compile(workspace, envs, compilerTask);
  // @ts-ignore
  cli.register(new CompileCmd(compile));
  return compile;
}
