/** @flow */
import serializeError from 'serialize-error';
import { buildInScope, testInScope, modifyCIProps } from '../../api/scope';

const scopePath = process.env.__scope__;
const id = process.env.__id__;
const startTime = Date.now();

function addCIAttrsInTheModel(error) {
  const endTime = Date.now();
  const ciProps = { startTime, endTime, error: undefined };

  if (error) {
    const serializedError = serializeError(error);
    ciProps.error = serializedError;
    return modifyCIProps(scopePath, id, ciProps);
  }
  
  return modifyCIProps(scopePath, id, ciProps);
}

try {
  // define options
  const environment = true;
  const save = true;
  const verbose = true;

  buildInScope({ id, scopePath, environment, save, verbose })
  .then(() => testInScope({ id, scopePath, environment, save, verbose }))
  .then(() => {
    return addCIAttrsInTheModel().then(() => null);
  })
  .catch((e) => {
    return addCIAttrsInTheModel(e).then(() => null);
  });
} catch (e) {
  addCIAttrsInTheModel(e).then(() => null);
}
