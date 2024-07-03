// all errors that the command does not handle comes to this switch statement
// if you handle the error, then return true
import chalk from 'chalk';
import { BitError } from '@teambit/bit-error';
import { Analytics, LEVEL } from '@teambit/legacy.analytics';
import hashErrorIfNeeded from '../error/hash-error-object';

/**
 * if err.userError is set, it inherits from AbstractError, which are user errors not Bit errors
 * and should not be reported to Sentry.
 * reason why we don't check (err instanceof AbstractError) is that it could be thrown from a fork,
 * in which case, it loses its class and has only the fields.
 */
export function sendToAnalyticsAndSentry(err: Error) {
  const possiblyHashedError = hashErrorIfNeeded(err);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const shouldNotReportToSentry = Boolean(err.isUserError || err.code === 'EACCES');
  // only level FATAL are reported to Sentry.
  const level = shouldNotReportToSentry ? LEVEL.INFO : LEVEL.FATAL;
  Analytics.setError(level, possiblyHashedError);
}

function handleNonBitCustomErrors(err: Error): string {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (err.code === 'EACCES' && err.path) {
    // see #1774
    return chalk.red(
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      `error: you do not have permissions to access '${err.path}', were you running bit, npm or git as root?`
    );
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return chalk.red(err.message || err);
}

export default (err: Error): { message: string; error: Error } => {
  const getErrMsg = (): string => {
    if (err instanceof BitError) {
      return err.report();
    }
    return handleNonBitCustomErrors(err);
  };
  sendToAnalyticsAndSentry(err);
  const errorMessage = getErrMsg();
  return { message: chalk.red(errorMessage), error: err };
};
