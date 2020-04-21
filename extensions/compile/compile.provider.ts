import { Workspace } from '@bit/bit.core.workspace';
import { BitCli } from '@bit/bit.core.cli';
import { CompileCmd } from './compile.cmd';
import { Compile } from './compile';
import { Flows } from '@bit/bit.core.flows';
import { Scope } from '@bit/bit.core.scope';

export type CompileDeps = [BitCli, Workspace, Flows, Scope];

export async function provideCompile([cli, workspace, flows, scope]: CompileDeps) {
  const compile = new Compile(workspace, flows, scope);
  // @ts-ignore
  cli.register(new CompileCmd(compile));
  return compile;
}
