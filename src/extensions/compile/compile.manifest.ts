import { ExtensionManifest } from '@teambit/harmony';
import { WorkspaceExt } from '../workspace';
import { Environments } from '../environments';
import { Workspace } from '../workspace';
import { CLIExtension } from '../cli';
import { CompileCmd } from './compile.cmd';
import { Compile } from './compile';
import { CompileTask } from './compile.task';

const name = 'compile';

export default {
  name,
  dependencies: [CLIExtension, WorkspaceExt, Environments],
  provider: provideCompile
} as ExtensionManifest;

export type CompileDeps = [CLIExtension, Workspace, Environments];

export async function provideCompile([cli, workspace, envs]: CompileDeps) {
  const compilerTask = new CompileTask(name);
  const compile = new Compile(workspace, envs, compilerTask);
  // @ts-ignore
  cli.register(new CompileCmd(compile));
  return compile;
}
