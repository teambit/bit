import { Workspace } from '../workspace';
import { BitCli } from '../cli';
import { CompileCmd } from './compile.cmd';
import { Compile } from './compile';

export type ServeConfig = {};

export type ServeDeps = [BitCli, Workspace];

export async function provideCompile(config: ServeConfig, [cli, workspace]: ServeDeps) {
  const compile = new Compile(workspace);
  // @ts-ignore
  cli.register(new CompileCmd(compile));
  return compile;
}
