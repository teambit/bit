import { buildRegistry } from '../../cli';
import { BitCli } from './cli';
import { Paper } from '../paper';
import { LegacyCommand } from './legacy-command';
import legacyLoadExtensions from '../../legacy-extensions/extensions-loader';

export type BitCLIDeps = [Paper];

export async function CLIProvider(config: {}, [paper]: BitCLIDeps) {
  const legacyExtensions = await legacyLoadExtensions(); // const legacyExtensions = await legacyLoadExtensions();
  // Make sure to register all the hooks actions in the global hooks manager	  // // Make sure to register all the hooks actions in the global hooks manager
  legacyExtensions.forEach(extension => {
    // legacyExtensions.forEach(extension => {
    extension.registerHookActionsOnHooksManager(); //   extension.registerHookActionsOnHooksManager();
  }); // });
  const extensionsCommands = legacyExtensions.reduce((acc, curr) => {
    // const extensionsCommands = legacyExtensions.reduce((acc, curr) => {
    if (curr.commands && curr.commands.length) {
      //   if (curr.commands && curr.commands.length) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!	  //     // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      acc = acc.concat(curr.commands); //     acc = acc.concat(curr.commands);
    } //   }
    return acc; //   return acc;
  }, []);

  const legacyRegistry = buildRegistry(extensionsCommands);
  const bitCLI = new BitCli(paper);
  const allCommands = legacyRegistry.commands.concat(legacyRegistry.extensionsCommands || []);
  allCommands.reduce((p, command) => {
    const legacyCommand = new LegacyCommand(command, p);
    p.register(legacyCommand);
    return p;
  }, paper);

  return bitCLI;
}
