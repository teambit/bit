import { Paper } from '../paper';
import { BitCli } from '../cli';
import CommandRegistry from './registry';
import { Bit } from '../bit';

export type PaperConfig = {};

export type PaperDeps = [];

export async function providePaper(config: PaperConfig, []: PaperDeps) {
  return new Paper(new CommandRegistry([]));
}
