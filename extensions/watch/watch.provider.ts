import { Workspace } from '@bit/bit.core.workspace';
import { BitCli } from '@bit/bit.core.cli';
import { WatchCommand } from './watch.cmd';
import { Compile } from '@bit/bit.core.compile';
import Watch from './watch';

export type watchDeps = [BitCli, Compile, Workspace];

export function provideWatch([cli, compile, workspace]: watchDeps) {
  const watch = new Watch(compile, workspace);
  // @ts-ignore
  cli.register(new WatchCommand(watch));
  return watch;
}
