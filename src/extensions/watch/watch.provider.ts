import { Workspace } from '../workspace';
// import { BitCli } from '../cli';
import { WatchCommand } from './watch.cmd';
import { Compile } from '../compile/compile';
import Watch from './watch';
import { PaperExtension } from '../paper';

export type watchDeps = [PaperExtension, Compile, Workspace];

export function provideWatch([cli, compile, workspace]: watchDeps) {
  const watch = new Watch(compile, workspace);
  // @ts-ignore
  cli.register(new WatchCommand(watch));
  return watch;
}
