/** @flow */
import buildRegistrar from './cli/command-registrar-builder';
import loudRejection from 'loud-rejection';

loudRejection();

const registrar = buildRegistrar();

try {
  registrar.run();
} catch (err) {
  console.error(err);
}
