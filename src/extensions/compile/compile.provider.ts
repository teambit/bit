import { Workspace } from '../workspace';
import { BitCli } from '../cli';
import { CompileCmd } from './compile.cmd';
import { Compile } from './compile';
import { Flows } from '../flows';

export type CompileConfig = {};

export type CompileDeps = [BitCli, Workspace, Flows];

export async function provideCompile([cli, workspace, scripts]: CompileDeps) {
  const compile = new Compile(workspace, scripts);
  // @ts-ignore
  cli.register(new CompileCmd(compile));
  return compile;
}
