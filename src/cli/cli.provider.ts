import { buildRegistry } from '../cli';
import BitCli from './cli.api';
import { Paper } from '../extensions/paper';
import { Bit } from '../extensions/bit';
import { LegacyCommand } from './legacy-command';

export type BitCLIDeps = [Paper, Bit];

export async function CLIProvider(config: {}, [paper, bit]: BitCLIDeps) {
  const legacyRegistry = buildRegistry([]);
  const bitCLI = new BitCli(paper);
  legacyRegistry.commands.reduce((p, command) => {
    const legacyCommand = new LegacyCommand(command, p);
    p.register(legacyCommand);
    return p;
  }, paper);

  bit.onExtensionsLoaded.subscribe(() => {
    const pr = bitCLI.run();
    return pr;
  });
  return bitCLI;
}
