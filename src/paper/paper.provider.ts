import { buildRegistry } from '../cli';
import { Paper } from '../paper';

export type PaperConfig = {
  silence: boolean;
};

export type PaperDeps = {};

export function providePaper({ silence }: PaperConfig) {
  const cmdRegistry = buildRegistry([]);

  try {
    cmdRegistry.run();
  } catch (err) {
    console.error('loud rejected:', err); // eslint-disable-line no-console
  }

  return new Paper();
}
