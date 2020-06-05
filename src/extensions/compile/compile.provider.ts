import { Harmony } from '@teambit/harmony';
import { Workspace } from '../workspace';
import { BitCli } from '../cli';
import { CompileCmd } from './compile.cmd';
import { Compile } from './compile';
import { Flows } from '../flows';
import { Scope } from '../scope';
import { Environments } from '../environments';

export type CompileDeps = [BitCli, Workspace, Flows, Scope, Environments];

export async function provideCompile(
  [cli, workspace, flows, scope, envs]: CompileDeps,
  _config,
  _slots,
  harmony: Harmony
) {
  const compile = new Compile(workspace, flows, scope, envs, harmony);
  // @ts-ignore
  cli.register(new CompileCmd(compile));
  return compile;
}
