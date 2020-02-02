import { buildRegistry } from '../../cli';
import { BitCli } from './cli';
import { Paper } from '../paper';
import { Bit } from '../bit';
import { LegacyCommand } from './legacy-command';
import legacyLoadExtensions from '../../legacy-extensions/extensions-loader';

export type BitCLIDeps = [Paper, Bit];

export async function CLIProvider(config: {}, [paper, bit]: BitCLIDeps) {
  // const legacyExtensions = await legacyLoadExtensions();
  // // Make sure to register all the hooks actions in the global hooks manager
  // legacyExtensions.forEach(extension => {
  //   extension.registerHookActionsOnHooksManager();
  // });
  // const extensionsCommands = legacyExtensions.reduce((acc, curr) => {
  //   if (curr.commands && curr.commands.length) {
  //     // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  //     acc = acc.concat(curr.commands);
  //   }
  //   return acc;
  // }, []);

  const legacyRegistry = buildRegistry([]);
  const bitCLI = new BitCli(paper);
  const allCommands = legacyRegistry.commands.concat(legacyRegistry.extensionsCommands || []);
  allCommands.reduce((p, command) => {
    const legacyCommand = new LegacyCommand(command, p);
    p.register(legacyCommand);
    return p;
  }, paper);

  return bitCLI;
}
