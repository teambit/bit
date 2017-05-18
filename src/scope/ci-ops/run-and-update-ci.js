/** @flow */
import serializeError from 'serialize-error';
import { buildInScope, testInScope, modifyCIProps } from '../../api/scope';

function runAndUpdateCI({ id, scopePath }: { id: string, scopePath: string }): Promise<any> {
  function addCIAttrsInTheModel({ error, startTime }: { error?: any, startTime: string }) {
    const endTime = Date.now().toString();
    const ciProps = { startTime, endTime, error: undefined };

    if (error) {
      const serializedError = serializeError(error);
      ciProps.error = serializedError;
      return modifyCIProps(scopePath, id, ciProps);
    }

    return modifyCIProps(scopePath, id, ciProps);
  }

  const startTime = Date.now().toString();

  try {
    // define options
    const environment = true;
    const save = true;
    const verbose = true;

    return buildInScope({ id, scopePath, environment, save, verbose })
      .then(() => testInScope({ id, scopePath, environment, save, verbose }))
      .then((specsResults) => {
        return addCIAttrsInTheModel({ startTime }).then(() => specsResults);
      })
      .catch((e) => {
        return addCIAttrsInTheModel({ error: e, startTime }).then(() => { throw e; });
      });
  } catch (e) {
    return addCIAttrsInTheModel({ error: e, startTime }).then(() => { throw e; });
  }
}

module.exports = runAndUpdateCI;
