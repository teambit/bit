/** @flow */
import loudRejection from 'loud-rejection';
import buildRegistrar from './cli/command-registrar-builder';
import loadExtensions from './extensions/extensions-loader';

loudRejection();

loadExtensions().then((extensions) => {
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
    console.error('loud rejected:', err);
  }
});
