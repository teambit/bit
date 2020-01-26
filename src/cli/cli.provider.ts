import { buildRegistry } from '../cli';
import BitCli from './cli.api';
import { Paper } from '../paper';
import { Bit } from '../bit';
import { LegacyCommand } from './legacy-command';

export type BitCLIDeps = [Paper, Bit];

export async function CLIProvider(config: {}, [paper, bit]: BitCLIDeps) {
  const legacyRegistry = buildRegistry([]);
  const bitCLI = new BitCli(paper);
  legacyRegistry.commands.reduce((p, command) => {
    const legacyCommand = new LegacyCommand(command, paper);
    p.register(legacyCommand);
    return p;
  }, paper);

  bit.onExtensionsLoaded.subscribe(() => {
    bitCLI.run();
  });
  return bitCLI;
}
