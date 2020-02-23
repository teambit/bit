import { Workspace } from '../workspace';
import { BitCli } from '../cli';
import { CompileCmd } from './compile.cmd';
import { Compile } from './compile';
import { Scripts } from '../scripts';

export type CompileConfig = {};

export type CompileDeps = [BitCli, Workspace, Scripts];

export async function provideCompile(config: CompileConfig, [cli, workspace, scripts]: CompileDeps) {
  const compile = new Compile(workspace, scripts);
  // @ts-ignore
  cli.register(new CompileCmd(compile));
  return compile;
}
