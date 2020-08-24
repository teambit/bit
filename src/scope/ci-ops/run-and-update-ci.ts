import { serializeError } from 'serialize-error';

import { buildInScope, modifyCIProps, testInScope } from '../../api/scope';

export default async function runAndUpdateCI({
  id,
  scopePath,
  verbose,
  directory,
  keep = false,
  noCache = false,
}: {
  id: string;
  scopePath?: string;
  verbose?: boolean;
  directory?: string;
  keep?: boolean;
  noCache?: boolean;
}): Promise<any> {
  function addCIAttrsInTheModel({ error, startTime }: { error?: any; startTime: string }) {
    const endTime = Date.now().toString();
    const ciProps = { startTime, endTime, error: undefined };

    if (error) {
      const serializedError = serializeError(error);
      ciProps.error = serializedError;
      return modifyCIProps(id, ciProps, scopePath);
    }

    return modifyCIProps(id, ciProps, scopePath);
  }

  const startTime = Date.now().toString();

  try {
    // define options
    const save = true;
    const buildResults = await buildInScope({ id, scopePath, save, verbose, directory, keep, noCache });
    const testResults = await testInScope({ id, scopePath, save, verbose, directory, keep });
    const dists = buildResults ? buildResults.dists : null;
    await addCIAttrsInTheModel({ startTime });
    return { specsResults: testResults, dists };
  } catch (e) {
    await addCIAttrsInTheModel({ error: e, startTime });
    throw e;
  }
}
