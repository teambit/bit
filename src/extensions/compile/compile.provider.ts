import { Workspace } from '../workspace';
import { BitCli } from '../cli';
import { CompileCmd } from './compile.cmd';
import { Compile } from './compile';

export type CompileConfig = {};

export type CompileDeps = [BitCli, Workspace];

export async function provideCompile(config: CompileConfig, [cli, workspace]: CompileDeps) {
  const compile = new Compile(workspace);
  // @ts-ignore
  cli.register(new CompileCmd(compile));
  return compile;
}
