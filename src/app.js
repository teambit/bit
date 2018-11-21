/** @flow */
import loudRejection from 'loud-rejection';
import buildRegistrar from './cli/command-registrar-builder';
import extensionRegistry from './extensions/extension-registry';
import HooksManager from './hooks';

// un-comment the next line to get more than 10 lines in the error stacktrace
// Error.stackTraceLimit = Infinity;

loudRejection();
HooksManager.init();

// Load extensions
extensionRegistry.init().then(async () => {
  const storeData = await extensionRegistry.toStore();
  console.log(JSON.stringify(storeData, null, 2));
  // Make sure to register all the hooks actions in the global hooks manager
  // extensions.forEach((extension) => {
  //   extension.registerHookActionsOnHooksManager();
  // });
  // const extensionsCommands = extensions.reduce((acc, curr) => {
  //   if (curr.commands && curr.commands.length) {
  //     acc = acc.concat(curr.commands);
  //   }
  //   return acc;
  // }, []);
  // const registrar = buildRegistrar(extensionsCommands);
  const registrar = buildRegistrar([]);

  try {
    registrar.run();
  } catch (err) {
    console.error('loud rejected:', err); // eslint-disable-line no-console
  }
});
