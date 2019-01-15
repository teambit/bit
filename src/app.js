/** @flow */
import loudRejection from 'loud-rejection';
import buildRegistrar from './cli/command-registrar-builder';
import loadExtensions from './extensions/extensions-loader';
import HooksManager from './hooks';
import loadVersionHandler from './cli/version-command';

// un-comment the next line to get more than 10 lines in the error stacktrace
// Error.stackTraceLimit = Infinity;

loadVersionHandler();
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
