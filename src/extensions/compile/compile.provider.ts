import { Workspace } from '../workspace';
import { BitCli } from '../cli';
import { CompileCmd } from './compile.cmd';
import { Compile } from './compile';
import { Flows } from '../flows';
import { Scope } from '../scope';

export type CompileConfig = {};

export type CompileDeps = [BitCli, Workspace, Flows, Scope];

export async function provideCompile(config: CompileConfig, [cli, workspace, scripts, scope]: CompileDeps) {
  const compile = new Compile(workspace, scripts, scope);
  // @ts-ignore
  cli.register(new CompileCmd(compile));
  return compile;
}
