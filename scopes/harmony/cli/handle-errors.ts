import logger from '@teambit/legacy/dist/logger/logger';
import defaultHandleError from '@teambit/legacy/dist/cli/default-error-handler';
import loader from '@teambit/legacy/dist/cli/loader';

export async function handleErrorAndExit(err: Error, commandName: string): Promise<void> {
  try {
    loader.off();
    logger.error(`got an error from command ${commandName}: ${err}`, err);
    const { message } = defaultHandleError(err);
    await logErrAndExit(message, commandName, err);
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('failed to log the error properly, failure error', e);
    // eslint-disable-next-line no-console
    console.error('failed to log the error properly, original error', err);
    process.exit(1);
  }
}

export async function handleUnhandledRejection(err: Error | null | undefined | {}) {
  // eslint-disable-next-line no-console
  console.error('** unhandled rejection found, please make sure the promise is resolved/rejected correctly! **');
  if (err instanceof Error) {
    return handleErrorAndExit(err, process.argv[2]);
  }
  console.error(err); // eslint-disable-line
  return handleErrorAndExit(new Error(`unhandledRejections found. err ${err}`), process.argv[2]);
}

async function logErrAndExit(errMsg: Error | string, commandName: string, errObj: Error) {
  if (!errMsg) throw new Error(`logErrAndExit expects to get either an Error or a string, got nothing`);
  console.error(errMsg); // eslint-disable-line
  // for CI, print the entire error with the stacktrace
  if (process.env.CI) console.error(errObj); // eslint-disable-line
  await logger.exitAfterFlush(1, commandName, errMsg.toString());
}
