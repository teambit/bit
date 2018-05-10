/** @flow */
import path from 'path';
import R from 'ramda';
import { fork } from 'child_process';
import deserializeError from 'deserialize-error';
import { Results } from '../consumer/specs-results';
import type { RawTestsResults } from '../consumer/specs-results/specs-results';
import type { ForkLevel } from '../api/consumer/lib/test';
import { TESTS_FORK_LEVEL } from '../constants';
import { Analytics } from '../analytics/analytics';
import logger from '../logger/logger';
import ExternalError from '../error/external-error';
import ExternalBuildError from '../consumer/component/exceptions/external-build-error';
import ExternalTestError from '../consumer/component/exceptions/external-test-error';

export type Tester = {
  run: (filePath: string) => Promise<Results>,
  globals: Object,
  modules: Object
};

export default (async function run({
  ids,
  forkLevel,
  verbose
}: {
  ids: ?(string[]),
  forkLevel: ForkLevel,
  verbose: ?boolean
}): Promise<?RawTestsResults> {
  if (!ids || R.isEmpty(ids)) {
    Analytics.addBreadCrumb('specs-runner.run', 'running tests on one child process without ids');
    logger.debug('specs-runner.run', 'running tests on one child process without ids');
    return runOnChildProcess({ verbose });
  }
  if (forkLevel === TESTS_FORK_LEVEL.ONE) {
    Analytics.addBreadCrumb('specs-runner.run', 'running tests on one child process with ids');
    logger.debug('specs-runner.run', 'running tests on one child process with ids');
    return runOnChildProcess({ ids, verbose });
  }
  Analytics.addBreadCrumb('specs-runner.run', 'running tests on child process for each component');
  logger.debug('specs-runner.run', 'running tests on child process for each component');
  const wrappedRunOnChildProcess = id => () => runOnChildProcess({ ids: [id], verbose });
  const allRunnersP = ids.map(wrappedRunOnChildProcess);
  const allRunnersResults = await Promise.all(allRunnersP);
  if (!allRunnersResults) return undefined;
  const finalResults = allRunnersResults.reduce((acc, curr) => {
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

function runOnChildProcess({ ids, verbose }: { ids?: ?(string[]), verbose: ?boolean }): Promise<?RawTestsResults> {
  return new Promise((resolve, reject) => {
    const debugPort = getDebugPort();
    const openPort = debugPort ? debugPort + 1 : null;
    const baseEnv: Object = {
      __verbose__: verbose
    };
    // Don't use ternary condition since if we put it as undefined
    // It will pass to the fork as "undefined" (string) instad of not passing it at all
    // __ids__: ids ? ids.join() : undefined,
    if (ids) {
      baseEnv.__ids__ = ids.join();
    }

    // Merge process.env from the main process
    const env = Object.assign({}, process.env, baseEnv);

    const child = fork(path.join(__dirname, 'worker.js'), {
      execArgv: openPort ? [`--debug=${openPort.toString()}`] : [],
      silent: false,
      env
    });

    child.on('exit', (code) => {
      if (code !== 0) reject();
    });
    process.on('exit', () => {
      child.kill('SIGKILL');
    });

    child.on('message', (results) => {
      // if (type === 'error') return reject(payload);
      // if (payload.specPath) payload.specPath = testFile.relative;
      const deserializedResults = deserializeResults(results);
      if (!deserializedResults) return resolve(undefined);
      if (deserializedResults.type === 'error') {
        return reject(deserializedResults.error);
      }
      return resolve(deserializedResults.results);
    });

    child.on('error', (e) => {
      reject(e);
    });
  });
}

function deserializeResults(results): ?{ type: 'results' | 'error', error?: Error, results?: RawTestsResults } {
  if (!results) return undefined;
  if (results.type === 'error') {
    let deserializedError = deserializeError(results.error);
    // Special desrialization for external errors
    if (deserializedError.originalError) {
      const deserializedOriginalError = deserializeError(deserializedError.originalError);
      if (results.error.name === ExternalBuildError.name) {
        deserializedError = new ExternalBuildError(deserializedOriginalError, deserializedError.id);
      } else if (results.error.name === ExternalTestError.name) {
        deserializedError = new ExternalTestError(deserializedOriginalError, deserializedError.id);
      } else {
        deserializedError = new ExternalError(deserializedOriginalError);
      }
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
    if (!result.failures) return result;
    result.failures = result.failures.map(deserializeFailure);
    return result;
  };

  const deserializedResults = results.results.map(deserializeResult);
  return { type: 'results', results: deserializedResults };
}
