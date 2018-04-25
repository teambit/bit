// @flow
// TODO - move to language specific driver.
import serializeError from 'serialize-error';
import { testInProcess } from '../api/consumer/lib/test';

const testOneComponent = verbose => async (id: string) => {
  const res = await testInProcess(id, verbose);
  return res[0];
};

function run() {
  const ids = process.env.__ids__ ? process.env.__ids__.split() : undefined;
  const verbose: boolean = process.env.__verbose__ === true;
  if (!ids || !ids.length) {
    return process.send([]);
  }
  const testAllP = ids.map(testOneComponent(verbose));
  Promise.all(testAllP).then((results) => {
    const serializedResults = serializeResults(results);
    return process.send(serializedResults);
  });
}

run();

function serializeResults(results) {
  if (!results) return undefined;
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
  return serializedResults;
}
