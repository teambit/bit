import execa from 'execa';
import pEvent from 'p-event';
import * as path from 'path';
import R from 'ramda';
import { deserializeError } from 'serialize-error';

import { Analytics } from '../analytics/analytics';
import { ForkLevel } from '../api/consumer/lib/test';
import { BitId } from '../bit-id';
import { TESTS_FORK_LEVEL } from '../constants';
import ExternalBuildErrors from '../consumer/component/exceptions/external-build-errors';
import ExternalTestErrors from '../consumer/component/exceptions/external-test-errors';
import { Results, SpecsResultsWithMetaData } from '../consumer/specs-results/specs-results';
import ExternalErrors from '../error/external-errors';
import logger from '../logger/logger';

export type Tester = {
  run: (filePath: string) => Promise<Results>;
  globals: Record<string, any>;
  modules: Record<string, any>;
};

export default async function run({
  ids,
  forkLevel,
  includeUnmodified = false,
  verbose,
}: {
  ids: string[] | null | undefined;
  forkLevel: ForkLevel;
  includeUnmodified: boolean;
  verbose: boolean | null | undefined;
}): Promise<SpecsResultsWithMetaData | null | undefined> {
  if (!ids || R.isEmpty(ids)) {
    Analytics.addBreadCrumb('specs-runner.run', 'running tests on one child process without ids');
    logger.debug('specs-runner.run, running tests on one child process without ids');
    return runOnChildProcess({
      includeUnmodified,
      verbose,
    });
  }
  if (forkLevel === TESTS_FORK_LEVEL.ONE) {
    Analytics.addBreadCrumb('specs-runner.run', 'running tests on one child process with ids');
    logger.debug('specs-runner.run, running tests on one child process with ids');
    return runOnChildProcess({
      ids,
      includeUnmodified: false, // no meaning to pass this when there is specific ids
      verbose,
    });
  }
  Analytics.addBreadCrumb('specs-runner.run', 'running tests on child process for each component');
  logger.debug('specs-runner.run, running tests on child process for each component');
  const allRunnersP = ids.map((id) =>
    runOnChildProcess({
      ids: [id],
      includeUnmodified: false, // no meaning to pass this when there is specific ids
      verbose,
    })
  );
  const allRunnersResults = await Promise.all(allRunnersP);
  if (!allRunnersResults || !allRunnersResults.length) return undefined;
  const finalResults = allRunnersResults.reduce(
    (acc, curr) => {
      // if (!curr || !curr[0]) return acc;
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (curr.childOutput) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        acc.childOutput = `${acc.childOutput}\n${curr.childOutput}`;
      }
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (curr.results && curr.results[0]) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        acc.results.push(curr.results[0]);
      }
      return acc;
    },
    { type: 'results', childOutput: '', results: [] }
  );
  return finalResults;
}

async function runOnChildProcess({
  ids,
  includeUnmodified,
  verbose,
}: {
  ids?: string[] | null | undefined;
  includeUnmodified: boolean | null | undefined;
  verbose: boolean | null | undefined;
}): Promise<SpecsResultsWithMetaData | null | undefined> {
  // Check if we run from npm or from binary (pkg)
  let args: string[] = [];
  if (ids) {
    args = args.concat(ids);
  }
  if (verbose) {
    args.push('--verbose');
  }
  if (includeUnmodified) {
    args.push('--all');
  }
  const baseEnv: Record<string, any> = {
    __verbose__: verbose,
    __includeUnmodified__: includeUnmodified,
  };
  // Don't use ternary condition since if we put it as undefined
  // It will pass to the fork as "undefined" (string) instad of not passing it at all
  // __ids__: ids ? ids.join() : undefined,
  if (ids) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    baseEnv.__ids__ = ids.join();
  }
  // Merge process.env from the main process
  const env = Object.assign({}, process.env, baseEnv);
  const workerPath = path.join(__dirname, 'worker.js');
  // if (process.pkg) {
  //   const entryPoint = process.argv[1];
  //   workerPath = path.join(entryPoint, '../../dist/specs-runner/worker.js');
  // }
  const child = execa.node(workerPath, args, { env, nodeOptions: ['--no-warnings'] });
  const result = await pEvent(child, 'message');
  const childResult = await child;
  if (!result) {
    return null;
  }

  const deserializedResults = deserializeResults(result);
  if (!deserializedResults) return null;
  if (childResult.all) {
    deserializedResults.childOutput = childResult.all;
  }
  if (deserializedResults.type === 'error') {
    if (deserializedResults.error instanceof Error) {
      throw deserializedResults.error;
    }
    throw new Error(deserializedResults.error);
  }
  return deserializedResults;
}

function deserializeResults(results): SpecsResultsWithMetaData | null | undefined {
  if (!results) return undefined;
  if (results.type === 'error') {
    let deserializedError = deserializeError(results.error);
    // Special desrialization for external errors
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (deserializedError.originalErrors) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const deserializedOriginalErrors = deserializedError.originalErrors.map(deserializeError);
      if (results.error.name === ExternalBuildErrors.name) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        deserializedError = new ExternalBuildErrors(deserializedError.id, deserializedOriginalErrors);
      } else if (results.error.name === ExternalTestErrors.name) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        deserializedError = new ExternalTestErrors(deserializedError.id, deserializedOriginalErrors);
      } else {
        deserializedError = new ExternalErrors(deserializedOriginalErrors);
      }
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (deserializedError.originalError) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const deserializedOriginalError = deserializeError(deserializedError.originalError);
      const compName =
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        deserializedError.compName && typeof deserializedError.compName === 'string' ? deserializedError.compName : '';
      deserializedError = new ExternalTestErrors(compName, [deserializedOriginalError]);
    }
    const finalResults = {
      type: 'error',
      error: deserializedError,
    };
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
    results: deserializedResults,
  };
}
