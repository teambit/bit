import { Workspace } from '../workspace';
// import { BitCli } from '../cli';
import { WatchCommand } from './watch.cmd';
import { Compile } from '../compiler';
import Watch from './watch';
import { CLIExtension } from '../cli';

export type watchDeps = [CLIExtension, Compile, Workspace];

export function provideWatch([cli, compile, workspace]: watchDeps) {
  const watch = new Watch(compile, workspace);
  cli.register(new WatchCommand(watch));
  return watch;
}
