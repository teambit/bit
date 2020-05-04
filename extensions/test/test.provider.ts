import { Workspace } from '@bit/bit.core.workspace';
import { BitCli } from '@bit/bit.core.cli';
import { TestCmd } from './test.cmd';
import { Test } from './test';
import { Compile } from '@bit/bit.core.compile';

export type ServeConfig = {};

export type testDeps = [BitCli, Compile, Workspace];

export async function provideTest([cli, compile, workspace]: testDeps) {
  const test = new Test(compile, workspace);
  // @ts-ignore
  cli.register(new TestCmd(test));
  return test;
}
