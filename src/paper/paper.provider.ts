import { Paper } from '../paper';
import { BitCli } from '../cli';
import CommandRegistry from './registry';
import { Bit } from '../bit';

export type PaperConfig = {
  silence: boolean;
};

export type PaperDeps = [BitCli, Bit];

export async function providePaper(config: PaperConfig, [cli, bit]: PaperDeps) {
  const paper = new Paper(cli, new CommandRegistry([]));
  bit.onExtensionsLoaded.subscribe(() => {
    paper.run();
  });

  return paper;
}
