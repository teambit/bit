import { Paper } from '../paper';
import CommandRegistry from './registry';

export type PaperConfig = {
  silence: boolean;
};

export type PaperDeps = [];

export async function providePaper(config: PaperConfig, []: PaperDeps) {
  return new Paper(new CommandRegistry([]));
}
