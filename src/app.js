/** @flow */
import buildRegistrar from './cli/command-registrar-builder';

const registrar = buildRegistrar();

try {
  registrar.run();
} catch (err) {
  console.error(err);
}
