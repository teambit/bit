/** @flow */
import serializeError from 'serialize-error';
import { buildInScope, testInScope, modifyCIProps } from '../../api/scope';

async function runAndUpdateCI({
  id,
  scopePath,
  verbose,
  directory,
  keep
}: {
  id: string,
  scopePath: string,
  verbose: boolean,
  directory: ?string,
  keep?: boolean
}): Promise<any> {
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
    const environment = false; // the environments are installed automatically when missing
    const save = true;
    const buildResults = await buildInScope({ id, scopePath, environment, save, verbose, directory, keep, isCI: true });
    const testResults = await testInScope({ id, scopePath, environment, save, verbose, directory, keep, isCI: true });
    const dists = buildResults ? buildResults.dists : null;
    const mainFile = buildResults ? buildResults.mainFile : testResults.mainFile;
    await addCIAttrsInTheModel({ startTime });
    return { specsResults: testResults.specResults, dists, mainFile };
  } catch (e) {
    return addCIAttrsInTheModel({ error: e, startTime }).then(() => {
      throw e;
    });
  }
}

module.exports = runAndUpdateCI;
