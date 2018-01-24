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
    const save = true;
    const isCI = true;
    const buildResults = await buildInScope({ id, scopePath, save, verbose, directory, keep, isCI });
    const testResults = await testInScope({ id, scopePath, save, verbose, directory, keep, isCI });
    const dists = buildResults ? buildResults.dists : null;
    let mainFile, 
      mainDistFile;
    if (buildResults) {
      mainFile = buildResults.mainFile;
      mainDistFile = buildResults.mainDistFile;
    }
    if (!buildResults && testResults) {
      mainDistFile = testResults.mainDistFile;
      mainFile = testResults.mainFile;
    }
    await addCIAttrsInTheModel({ startTime });
    return { specsResults: testResults ? testResults.specResults : [], dists, mainFile, mainDistFile };
  } catch (e) {
    return addCIAttrsInTheModel({ error: e, startTime }).then(() => {
      throw e;
    });
  }
}

module.exports = runAndUpdateCI;
