import { Watch } from '../watch';
import Composer from './composer';
import ComposeCmd from './compose.cmd';
import { Workspace } from '../workspace';
import { BitCli } from '../cli';
import { Scripts } from '../scripts';

export type ComposerConfig = {};

export type ComposerDeps = [Watch, BitCli, Workspace, Scripts];

export async function provideComposer(config: ComposerConfig, [watch, cli, workspace, scripts]: ComposerDeps) {
  // @ts-ignore
  cli.register(new ComposeCmd(workspace, scripts));
  return new Composer(watch);
}
