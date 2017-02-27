/** @flow */
import loudRejection from 'loud-rejection';
import buildRegistrar from './cli/command-registrar-builder';

loudRejection();

const registrar = buildRegistrar();

try {
  registrar.run();
} catch (err) {
  console.error('loud rejected:', err);
}
