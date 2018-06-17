// @flow
// TODO - move to language specific driver.
import serializeError from 'serialize-error';
import { testInProcess } from '../api/consumer/lib/test';
import ExternalError from '../error/external-error';
import loader from '../cli/loader';

const testOneComponent = verbose => async (id: string) => {
  // $FlowFixMe
  const res = await testInProcess(id, verbose);
  return res[0];
};

function run(): Promise<void> {
  // Start the loader to make sure we show it on forked process
  loader.on();
  const ids = process.env.__ids__ ? process.env.__ids__.split() : undefined;
  const verbose: boolean = process.env.__verbose__ === true;
  if (!ids || !ids.length) {
    return testInProcess(undefined, verbose)
      .then((results) => {
        const serializedResults = serializeResults(results);
        // $FlowFixMe
        return process.send(serializedResults);
      })
      .catch((e) => {
        loader.off();
        const serializedResults = serializeResults(e);
        // $FlowFixMe
        return process.send(serializedResults);
      });
  }
  const testAllP = ids.map(testOneComponent(verbose));
  return Promise.all(testAllP)
    .then((results) => {
      const serializedResults = serializeResults(results);
      // $FlowFixMe
      return process.send(serializedResults);
    })
    .catch((e) => {
      loader.off();
      const serializedResults = serializeResults(e);
      // $FlowFixMe
      return process.send(serializedResults);
    });
}

run();

function serializeResults(results) {
  if (!results) return undefined;
  if (results instanceof Error) {
    // In case of extenral error also serialize the original error
    if (results instanceof ExternalError) {
      results.originalError = serializeError(results.originalError);
    }

    const serializedErr = serializeError(results);
    const finalResults = {
      type: 'error',
      error: serializedErr
    };
    return finalResults;
  }
  const serializeFailure = (failure) => {
    if (!failure) return undefined;
    const serializedFailure = failure;
    if (failure.err && failure.err instanceof Error) {
      serializedFailure.err = serializeError(failure.err);
    }
    return serializedFailure;
  };

  const serializeSpec = (spec) => {
    if (!spec.failures) return spec;
    spec.failures = spec.failures.map(serializeFailure);
    return spec;
  };

  const serializeResult = (result) => {
    if (!result.specs) return result;
    result.specs = result.specs.map(serializeSpec);
    return result;
  };

  const serializedResults = results.map(serializeResult);
  return { type: 'results', results: serializedResults };
}
