import { Workspace } from '../workspace';
import { BitCli } from '../cli';
import { TestCmd } from './test.cmd';
import { Test } from './test';
import { Compile } from '../compile/compile';

export type ServeConfig = {};

export type ServeDeps = [BitCli, Compile, Workspace];

export async function provideTest(config: ServeConfig, [cli, compile, workspace]: ServeDeps) {
  const test = new Test(compile, workspace);
  // @ts-ignore
  cli.register(new TestCmd(test));
  return test;
}
