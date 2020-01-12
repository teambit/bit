import { Paper } from '../paper';
import { BitCli } from '../cli';
import CommandRegistry from './registry';
import { Bit } from '../bit';

export type PaperConfig = {};

export type PaperDeps = [BitCli, Bit];

export async function providePaper(config: PaperConfig, [cli, bit]: PaperDeps) {
  const paper = new Paper(cli, new CommandRegistry([]));
  setTimeout(() => {
    bit.onExtensionsLoaded.subscribe(() => {
      paper.run();
    });
  }, 1000);
}
