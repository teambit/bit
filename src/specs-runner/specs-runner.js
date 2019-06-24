/** @flow */
import R from 'ramda';
import execa from 'execa';
import deserializeError from 'deserialize-error';
import { Results } from '../consumer/specs-results';
import type { ForkLevel } from '../api/consumer/lib/test';
import { TESTS_FORK_LEVEL } from '../constants';
import { Analytics } from '../analytics/analytics';
import logger from '../logger/logger';
import ExternalErrors from '../error/external-errors';
import ExternalBuildErrors from '../consumer/component/exceptions/external-build-errors';
import ExternalTestErrors from '../consumer/component/exceptions/external-test-errors';
import type { SpecsResultsWithComponentId } from '../consumer/specs-results/specs-results';
import { BitId } from '../bit-id';

export type Tester = {
  run: (filePath: string) => Promise<Results>,
  globals: Object,
  modules: Object
};

export default (async function run({
  ids,
  forkLevel,
  includeUnmodified = false,
  verbose
}: {
  ids: ?(string[]),
  forkLevel: ForkLevel,
  includeUnmodified: boolean,
  verbose: ?boolean
}): Promise<?SpecsResultsWithComponentId> {
  if (!ids || R.isEmpty(ids)) {
    Analytics.addBreadCrumb('specs-runner.run', 'running tests on one child process without ids');
    logger.debug('specs-runner.run', 'running tests on one child process without ids');
    return runOnChildProcess({
      includeUnmodified,
      verbose
    });
  }
  if (forkLevel === TESTS_FORK_LEVEL.ONE) {
    Analytics.addBreadCrumb('specs-runner.run', 'running tests on one child process with ids');
    logger.debug('specs-runner.run', 'running tests on one child process with ids');
    return runOnChildProcess({
      ids,
      includeUnmodified: false, // no meaning to pass this when there is specific ids
      verbose
    });
  }
  Analytics.addBreadCrumb('specs-runner.run', 'running tests on child process for each component');
  logger.debug('specs-runner.run', 'running tests on child process for each component');
  const allRunnersP = ids.map(id =>
    runOnChildProcess({
      ids: [id],
      includeUnmodified: false, // no meaning to pass this when there is specific ids
      verbose
    })
  );
  const allRunnersResults = ((await Promise.all(allRunnersP): any): SpecsResultsWithComponentId);
  if (!allRunnersResults || !allRunnersResults.length) return undefined;
  const finalResults = allRunnersResults.reduce((acc, curr) => {
    if (!curr || !curr[0]) return acc;
    acc.push(curr[0]);
    return acc;
  }, []);
  return finalResults;
});

function getDebugPort(): ?number {
  const debugPortArgName = '--debug-brk';
  try {
    const execArgv = process.execArgv.map(arg => arg.split('='));
    const execArgvObj = R.fromPairs(execArgv);
    if (execArgvObj[debugPortArgName]) return parseInt(execArgvObj[debugPortArgName]);
  } catch (e) {
    return null;
  }

  return null;
}

async function runOnChildProcess({
  ids,
  includeUnmodified,
  verbose
}: {
  ids?: ?(string[]),
  includeUnmodified: ?boolean,
  verbose: ?boolean
}): Promise<?SpecsResultsWithComponentId> {
  const debugPort = getDebugPort();
  const openPort = debugPort ? debugPort + 1 : null;

  // Check if we run from npm or from binary (pkg)
  let args = ['test-worker'];
  if (ids) {
    args = args.concat(ids);
  }
  if (verbose) {
    args.push('--verbose');
  }
  if (includeUnmodified) {
    args.push('--all');
  }
  try {
    const bitExecName = process.env.BIT_EXEC_NAME || 'bit';
    const { stdout, stderr } = await execa(bitExecName, args);
    // console.log('stdout', stdout)
    const parsedResults = JSON.parse(stdout);
    const deserializedResults = deserializeResults(parsedResults);
    if (!deserializedResults) return undefined;
    if (deserializedResults.type === 'error') {
      throw new Error(deserializedResults.error);
    }
    return deserializedResults.results;
  } catch (e) {
    throw e;
  }
}

function deserializeResults(
  results
): ?{
  type: 'results' | 'error',
  error?: Error,
  results?: SpecsResultsWithComponentId
} {
  if (!results) return undefined;
  if (results.type === 'error') {
    let deserializedError = deserializeError(results.error);
    // Special desrialization for external errors
    if (deserializedError.originalErrors) {
      const deserializedOriginalErrors = deserializedError.originalErrors.map(deserializeError);
      if (results.error.name === ExternalBuildErrors.name) {
        deserializedError = new ExternalBuildErrors(deserializedError.id, deserializedOriginalErrors);
      } else if (results.error.name === ExternalTestErrors.name) {
        deserializedError = new ExternalTestErrors(deserializedError.id, deserializedOriginalErrors);
      } else {
        deserializedError = new ExternalErrors(deserializedOriginalErrors);
      }
    }
    if (deserializedError.originalError) {
      const deserializedOriginalError = deserializeError(deserializedError.originalError);
      const compName =
        deserializedError.compName && typeof deserializedError.compName === 'string' ? deserializedError.compName : '';
      deserializedError = new ExternalTestErrors(compName, [deserializedOriginalError]);
    }
    const finalResults = {
      type: 'error',
      error: deserializedError
    };
    return finalResults;
  }
  const deserializeFailure = (failure) => {
    if (!failure) return undefined;
    const deserializedFailure = failure;
    if (failure.err) {
      try {
        deserializedFailure.err = deserializeError(failure.err);
      } catch (e) {
        logger.debug(`fail parsing error ${deserializedFailure.err}`);
      }
    }
    return deserializedFailure;
  };

  const deserializeResult = (result) => {
    result.componentId = new BitId(result.componentId); // when BitId is received from a fork it loses its class and appears as an object
    if (!result.failures) return result;
    result.failures = result.failures.map(deserializeFailure);
    return result;
  };

  const deserializedResults = results.results.map(deserializeResult);
  return {
    type: 'results',
    results: deserializedResults
  };
}
