import { Paper } from '../paper';
import { Reporter } from '../reporter';
import CommandRegistry from './registry';

export type PaperConfig = {
  silence: boolean;
};

export type PaperDeps = [Reporter];

export async function providePaper([reporter]: PaperDeps) {
  return new Paper(new CommandRegistry({}), reporter);
}
