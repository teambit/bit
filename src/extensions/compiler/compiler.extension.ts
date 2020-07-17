import { ExtensionManifest } from '@teambit/harmony';
import { WorkspaceExt } from '../workspace';
import { Environments } from '../environments';
import { Workspace } from '../workspace';
import { CLIExtension } from '../cli';
import { CompileCmd } from './compiler.cmd';
import { Compile } from './compile';
import { CompilerTask } from './compiler.task';

const name = 'compile';

export default {
  // id: '@teambit/compiler',
  icon: () => {
    return `<svg width="50" height="50" xmlns="http://www.w3.org/2000/svg">
      <circle cx="25" cy="25" r="20"/>
    </svg>`;
  },
  name,
  dependencies: [CLIExtension, WorkspaceExt, Environments],
  provider: provideCompile
} as ExtensionManifest;

export type CompileDeps = [CLIExtension, Workspace, Environments];

export async function provideCompile([cli, workspace, envs]: CompileDeps) {
  const compilerTask = new CompilerTask(name);
  const compile = new Compile(workspace, envs, compilerTask);
  cli.register(new CompileCmd(compile));
  return compile;
}
