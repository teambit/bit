import { CLI } from './cli';
import { Reporter } from '../reporter';
import CommandRegistry from './registry';
import { buildRegistry } from '../../cli';
import { LegacyCommand } from './legacy-command';
import legacyLoadExtensions from '../../legacy-extensions/extensions-loader';

export type CLIDeps = [Reporter];

export async function CLIProvider([reporter]: CLIDeps) {
  const legacyExtensions = await legacyLoadExtensions();
  // Make sure to register all the hooks actions in the global hooks manager
  legacyExtensions.forEach(extension => {
    extension.registerHookActionsOnHooksManager();
  });
  const extensionsCommands = legacyExtensions.reduce((acc, curr) => {
    if (curr.commands && curr.commands.length) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      acc = acc.concat(curr.commands);
    }
    return acc;
  }, []);

  const legacyRegistry = buildRegistry(extensionsCommands);
  const bitCLI = new CLI(new CommandRegistry({}), reporter);
  const allCommands = legacyRegistry.commands.concat(legacyRegistry.extensionsCommands || []);
  allCommands.reduce((p, command) => {
    const legacyCommand = new LegacyCommand(command, p);
    p.register(legacyCommand);
    return p;
  }, bitCLI);

  return bitCLI;
}
