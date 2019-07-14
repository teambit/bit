// @flow
// TODO - move to language specific driver.
import serializeError from 'serialize-error';
import { testInProcess } from '../api/consumer/lib/test';
import loader from '../cli/loader';
import ExternalErrors from '../error/external-errors';
import ExternalError from '../error/external-error';
import type { SpecsResultsWithComponentId } from '../consumer/specs-results/specs-results';

export type SerializedSpecsResultsWithComponentId = {
  type: 'error' | 'results',
  error?: Object,
  results?: SpecsResultsWithComponentId[]
};

const testOneComponent = verbose => async (id: string) => {
  // Never print the env message when originated from worker since we expect a valid json to return
  const DONT_PRINT_ENV_MSG = true;
  // $FlowFixMe
  const res = await testInProcess(id, false, verbose, DONT_PRINT_ENV_MSG);
  return res[0];
};

export default function run({
  ids,
  includeUnmodified = false,
  verbose
}: {
  ids?: ?(string[]),
  includeUnmodified: boolean,
  verbose: ?boolean
}): Promise<SerializedSpecsResultsWithComponentId> {
  if (!ids || !ids.length) {
    return testInProcess(undefined, includeUnmodified, verbose)
      .then((results) => {
        const serializedResults = serializeResults(results);
        return serializedResults;
      })
      .catch((e) => {
        loader.off();
        const serializedResults = serializeResults(e);
        return serializedResults;
      });
  }
  const testAllP = ids.map(testOneComponent(verbose));
  return Promise.all(testAllP)
    .then((results) => {
      const serializedResults = serializeResults(results);
      return serializedResults;
    })
    .catch((e) => {
      loader.off();
      const serializedResults = serializeResults(e);
      return serializedResults;
    });
}

function serializeResults(results): SerializedSpecsResultsWithComponentId {
  // if (!results) return undefined;
  if (!results) {
    return { type: 'results', results: [] };
  }

  if (results instanceof Error) {
    // In case of external error also serialize the original error
    if (results instanceof ExternalErrors) {
      results.originalErrors = results.originalErrors.map(serializeError);
    }

    if (results instanceof ExternalError) {
      results.originalError = serializeError(results);
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
  // $FlowFixMe
  return { type: 'results', results: serializedResults };
}
