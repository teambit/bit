import { buildRegistry, CommandRegistry } from '../cli';
import BitCli from './cli.api';
import { Paper } from '../paper';
import { Bit } from '../bit';
import { LegacyCommand } from './legacy-command';

export type BitCLIDeps = [Paper, Bit];
/**
 * a provider function for building `BitCli`
 */
export default async function cliProvider(config: {}, [paper, bit]: BitCLIDeps) {
  console.log('cli');
  const paperCommands = paper.commands.map(cmd => new LegacyCommand(cmd));
  const bitCLI = new BitCli(buildRegistry(paperCommands));
  bit.onExtensionsLoaded.subscribe(() => {
    console.log('all extensions loaded ');
    bitCLI.run();
  });
  return bitCLI;
}
