import { serializeError } from 'serialize-error';

import { testInProcess } from '../api/consumer/lib/test';
import loader from '../cli/loader';
import { SpecsResultsWithComponentId } from '../consumer/specs-results/specs-results';
import ExternalError from '../error/external-error';
import ExternalErrors from '../error/external-errors';

export type SerializedSpecsResultsWithComponentId = {
  type: 'error' | 'results';
  error?: Record<string, any>;
  results?: SpecsResultsWithComponentId[];
};

const testOneComponent = (verbose) => async (id: string) => {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const res = await testInProcess(id, false, verbose);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return res.results![0];
};

export default function run(): Promise<void> {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const ids = process.env.__ids__ ? process.env.__ids__.split() : undefined;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const verbose: boolean = process.env.__verbose__ === true || process.env.__verbose__ === 'true';
  const includeUnmodified: boolean =
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    process.env.__includeUnmodified__ === true || process.env.__includeUnmodified__ === 'true';
  if (!ids || !ids.length) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return testInProcess(undefined, includeUnmodified, verbose)
      .then((results) => {
        const serializedResults = serializeResults(results.results);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        process.send(serializedResults);
        // Make sure the child process will not hang
        // This is inside timeout, since in rare cases the exit might happen before the send
        // which cause the parent process to hang (since it never get the message)
        setTimeout(() => {
          process.exit();
        }, 0);
      })
      .catch((e) => {
        loader.off();
        const serializedResults = serializeResults(e);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        process.send(serializedResults);
        // Make sure the child process will not hang
        // This is inside timeout, since in rare cases the exit might happen before the send
        // which cause the parent process to hang (since it never get the message)
        setTimeout(() => {
          process.exit();
        }, 0);
      });
  }
  const testAllP = ids.map(testOneComponent(verbose));
  return Promise.all(testAllP)
    .then((results) => {
      const serializedResults = serializeResults(results);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      process.send(serializedResults);
      // Make sure the child process will not hang
      // This is inside timeout, since in rare cases the exit might happen before the send
      // which cause the parent process to hang (since it never get the message)
      setTimeout(() => {
        process.exit();
      }, 0);
    })
    .catch((e) => {
      loader.off();
      const serializedResults = serializeResults(e);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      process.send(serializedResults);
      // Make sure the child process will not hang
      // This is inside timeout, since in rare cases the exit might happen before the send
      // which cause the parent process to hang (since it never get the message)
      setTimeout(() => {
        process.exit();
      }, 0);
    });
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();

function serializeResults(results): SerializedSpecsResultsWithComponentId {
  // if (!results) return undefined;
  if (!results) {
    return { type: 'results', results: [] };
  }

  if (results instanceof Error) {
    // In case of external error also serialize the original error
    if (results instanceof ExternalErrors) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      results.originalErrors = results.originalErrors.map(serializeError);
    }

    if (results instanceof ExternalError) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      results.originalError = serializeError(results);
    }

    const serializedErr = serializeError(results);
    const finalResults = {
      type: 'error',
      error: serializedErr,
    };
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
    const specs = result.specs;
    if (!specs || !Array.isArray(specs)) return result;
    result.specs = specs.map(serializeSpec);
    return result;
  };

  const serializedResults = results.map(serializeResult);
  return { type: 'results', results: serializedResults };
}
