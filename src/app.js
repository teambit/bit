/** @flow */
import * as Promise from 'bluebird';
import loudRejection from 'loud-rejection';
import buildRegistrar from './cli/command-registrar-builder';
import loadExtensions from './extensions/extensions-loader';
import HooksManager from './hooks';

Promise.config({
  longStackTraces: false // change it to true for easy debugging. by default, leave it as false for better performance
});

loudRejection();
HooksManager.init();

// Load extensions
loadExtensions().then((extensions) => {
  // Make sure to register all the hooks actions in the global hooks manager
  extensions.forEach((extension) => {
    extension.registerHookActionsOnHooksManager();
  });
  const extensionsCommands = extensions.reduce((acc, curr) => {
    if (curr.commands && curr.commands.length) {
      acc = acc.concat(curr.commands);
    }
    return acc;
  }, []);
  const registrar = buildRegistrar(extensionsCommands);

  try {
    registrar.run();
  } catch (err) {
    console.error('loud rejected:', err); // eslint-disable-line no-console
  }
});
