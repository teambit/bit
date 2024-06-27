// all errors that the command does not handle comes to this switch statement
// if you handle the error, then return true
import chalk from 'chalk';
import { BitError } from '@teambit/bit-error';
import { Analytics, LEVEL } from '@teambit/legacy.analytics';
import NoIdMatchWildcard from '../api/consumer/lib/exceptions/no-id-match-wildcard';
import NothingToCompareTo from '../api/consumer/lib/exceptions/nothing-to-compare-to';
import ObjectsWithoutConsumer from '../api/consumer/lib/exceptions/objects-without-consumer';
import { BASE_DOCS_DOMAIN } from '../constants';
import { InvalidBitMap, MissingMainFile } from '../consumer/bit-map/exceptions';
import OutsideRootDir from '../consumer/bit-map/exceptions/outside-root-dir';
import {
  DuplicateIds,
  ExcludedMainFile,
  MainFileIsDir,
  MissingMainFileMultipleComponents,
  NoFiles,
  PathOutsideConsumer,
  PathsNotExist,
  VersionShouldBeRemoved,
} from '../consumer/component-ops/add-components/exceptions';
import { AddingIndividualFiles } from '../consumer/component-ops/add-components/exceptions/adding-individual-files';
import ComponentsPendingMerge from '../consumer/component-ops/exceptions/components-pending-merge';
import ComponentNotFoundInPath from '../consumer/component/exceptions/component-not-found-in-path';
import FileSourceNotFound from '../consumer/component/exceptions/file-source-not-found';
import MainFileRemoved from '../consumer/component/exceptions/main-file-removed';
import InvalidPackageJson from '../consumer/config/exceptions/invalid-package-json';
import InvalidPackageManager from '../consumer/config/exceptions/invalid-package-manager';
import { ComponentOutOfSync, ConsumerNotFound, NewerVersionFound } from '../consumer/exceptions';
import hashErrorIfNeeded from '../error/hash-error-object';
import ValidationError from '../error/validation-error';
import PromptCanceled from '../prompts/exceptions/prompt-canceled';
import RemoteNotFound from '../remotes/exceptions/remote-not-found';
import {
  ComponentNotFound,
  HashNotFound,
  InvalidIndexJson,
  OutdatedIndexJson,
  ParentNotFound,
  ScopeJsonNotFound,
  VersionAlreadyExists,
} from '../scope/exceptions';
import {
  NetworkError,
  ProtocolNotSupported,
  RemoteScopeNotFound,
  UnexpectedNetworkError,
} from '../scope/network/exceptions';
import GitNotFound from '../utils/git/exceptions/git-not-found';
import newerVersionTemplate from './templates/newer-version-template';
import GeneralError from '../error/general-error';

const reportIssueToGithubMsg =
  'This error should have never happened. Please report this issue on Github https://github.com/teambit/bit/issues';

// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
const errorsMap: Array<[Class<Error>, (err: Class<Error>) => string]> = [
  [GeneralError, (err) => `${err.msg}`],

  [VersionAlreadyExists, (err) => `error: version ${err.version} already exists for ${err.componentId}`],
  [ConsumerNotFound, () => 'workspace not found. to initiate a new workspace, please use `bit init`'],
  [FileSourceNotFound, (err) => `file or directory "${err.path}" was not found`],
  [
    OutsideRootDir,
    (err) => `unable to add file ${err.filePath} because it's located outside the component root dir ${err.rootDir}`,
  ],
  [
    AddingIndividualFiles,
    (err) => `error: adding individual files is blocked ("${err.file}"), and only directories can be added`,
  ],
  [
    ProtocolNotSupported,
    () => 'error: remote scope protocol is not supported, please use: `file://`, `http://`, `https://`',
  ],
  [RemoteScopeNotFound, (err) => `error: remote scope "${chalk.bold(err.name)}" was not found.`],
  // TODO: improve error
  [
    ComponentsPendingMerge,
    (err) => {
      const componentsStr = err.divergeData
        .map(
          (d) =>
            `${chalk.bold(d.id)} has ${chalk.bold(d.snapsLocal)} snaps locally only and ${chalk.bold(
              d.snapsRemote
            )} snaps remotely only`
        )
        .join('\n');
      return `the local and remote history of the following component(s) have diverged\n${componentsStr}\nPlease use --merge to merge them`;
    },
  ],
  [
    ComponentNotFound,
    (err) => {
      return err.dependentId
        ? `error: the component dependency "${chalk.bold(err.id)}" required by "${chalk.bold(
            err.dependentId
          )}" was not found`
        : `error: component "${chalk.bold(err.id)}" was not found`;
    },
  ],
  [ValidationError, (err) => `${err.message}\n${reportIssueToGithubMsg}`],
  [ComponentNotFoundInPath, (err) => `error: component in path "${chalk.bold(err.path)}" was not found`],
  [RemoteNotFound, (err) => `error: remote "${chalk.bold(err.name)}" was not found`],
  [NetworkError, (err) => `error: remote failed with error the following error:\n "${chalk.bold(err.remoteErr)}"`],
  [HashNotFound, (err) => `hash ${chalk.bold(err.hash)} not found`],
  [
    OutdatedIndexJson,
    (err) => `error: ${chalk.bold(err.id)} found in the index.json file, however, is missing from the scope.
the cache is deleted and will be rebuilt on the next command. please re-run the command.`,
  ],
  [
    UnexpectedNetworkError,
    (err) => `unexpected network error has occurred.
${err.message ? `server responded with: "${err.message}"` : ''}`,
  ],
  [
    InvalidIndexJson,
    (err) => `fatal: your .bit/index.json is not a valid JSON file.
To rebuild the file, please run ${chalk.bold('bit init --reset')}.
Original Error: ${err.message}`,
  ],
  [
    ScopeJsonNotFound,
    (err) =>
      `error: scope.json file was not found at ${chalk.bold(err.path)}, please use ${chalk.bold(
        'bit init'
      )} to recreate the file`,
  ],
  [
    ComponentOutOfSync,
    (err) => `component ${chalk.bold(err.id)} is not in-sync between the consumer and the scope.
if it is originated from another git branch, go back to that branch to continue working on the component.
if possible, remove the component using "bit remove" and re-import or re-create it.
to re-start Bit from scratch, deleting all objects from the scope, use "bit init --reset-hard"`,
  ],
  [
    InvalidPackageManager,
    (err) => `error: the package manager provided ${chalk.bold(err.packageManager)} is not a valid package manager.
please specify 'npm' or 'yarn'`,
  ],
  [
    InvalidPackageJson,
    (err) => `error: package.json at ${chalk.bold(err.path)} is not a valid JSON file.
please fix the file in order to run bit commands`,
  ],
  [
    MissingMainFile,
    (err) =>
      `error: the component ${chalk.bold(
        err.componentId
      )} does not contain a main file.\nplease either use --id to group all added files as one component or use our DSL to define the main file dynamically.\nsee troubleshooting at ${BASE_DOCS_DOMAIN}components/component-main-file`,
  ],
  [
    MissingMainFileMultipleComponents,
    (err) =>
      `error: the components ${chalk.bold(
        err.componentIds.join(', ')
      )} does not contain a main file.\nplease either use --id to group all added files as one component or use our DSL to define the main file dynamically.\nsee troubleshooting at ${BASE_DOCS_DOMAIN}components/component-main-file`,
  ],
  [
    InvalidBitMap,
    (err) =>
      `error: unable to parse your bitMap file at ${chalk.bold(err.path)}, due to an error ${chalk.bold(
        err.errorMessage
      )}.
      consider running ${chalk.bold('bit init --reset')} to recreate the file`,
  ],
  [ExcludedMainFile, (err) => `error: main file ${chalk.bold(err.mainFile)} was excluded from file list`],
  [
    MainFileRemoved,
    (err) => `error: main file ${chalk.bold(err.mainFile)} was removed from ${chalk.bold(err.id)}.
please use "bit remove" to delete the component or "bit add" with "--main" and "--id" flags to add a new mainFile`,
  ],
  [
    VersionShouldBeRemoved,
    (err) => `please remove the version part from the specified id ${chalk.bold(err.id)} and try again`,
  ],
  [
    MainFileIsDir,
    (err) =>
      `error: the specified main path ${chalk.bold(
        err.mainFile
      )} is a directory, please specify a file or a pattern DSL`,
  ],
  [PathsNotExist, (err) => `error: file or directory "${chalk.bold(err.paths.join(', '))}" was not found.`],
  [
    PathOutsideConsumer,
    (err) => `error: file or directory "${chalk.bold(err.path)}" is located outside of the workspace.`,
  ],
  [
    ParentNotFound,
    (err) =>
      `component ${chalk.bold(err.id)} missing data. parent ${err.parentHash} of version ${
        err.versionHash
      } was not found.`,
  ],
  [
    NoFiles,
    (err) =>
      chalk.yellow('warning: no files to add') +
      chalk.yellow(err.ignoredFiles ? `, the following files were ignored: ${chalk.bold(err.ignoredFiles)}` : ''),
  ],
  [
    DuplicateIds,
    (err) =>
      Object.keys(err.componentObject)
        .map((key) => {
          return `unable to add ${
            Object.keys(err.componentObject[key]).length
          } components with the same ID: ${chalk.bold(key)} : ${err.componentObject[key]}\n`;
        })
        .join(' '),
  ],
  [
    NoIdMatchWildcard,
    (err) => `unable to find component ids that match the following: ${err.idsWithWildcards.join(', ')}`,
  ],
  [NothingToCompareTo, () => 'no previous versions to compare'],
  [
    NewerVersionFound,
    // err => JSON.stringify(err.newerVersions)
    (err) => newerVersionTemplate(err.newerVersions),
  ],
  [PromptCanceled, () => chalk.yellow('operation aborted')],
  [
    GitNotFound,
    () =>
      "error: unable to run command because git executable not found. please ensure git is installed and/or git_path is configured using the 'bit config set git_path <GIT_PATH>'",
  ],
  [
    ObjectsWithoutConsumer,
    (err) => `error: unable to initialize a bit workspace. bit has found undeleted local objects at ${chalk.bold(
      err.scopePath
    )}.
1. use the ${chalk.bold('--reset-hard')} flag to clear all data and initialize an empty workspace.
2. if deleted by mistake, please restore .bitmap and workspace.jsonc.
3. force workspace initialization without clearing data use the ${chalk.bold('--force')} flag.`,
  ],
];

export function findErrorDefinition(err: Error) {
  const error = errorsMap.find(([ErrorType]) => {
    return err instanceof ErrorType || (err && err.name === ErrorType.name); // in some cases, such as forked process, the received err is serialized.
  });
  return error;
}

function getErrorFunc(errorDefinition) {
  if (!errorDefinition) return null;
  const [, func] = errorDefinition;
  return func;
}

function getErrorMessage(error: Error | null | undefined, func: Function | null | undefined): string {
  if (!error || !func) return '';
  let errorMessage = func(error);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (error.showDoctorMessage) {
    errorMessage = `${errorMessage}

run 'bit doctor' to get detailed workspace diagnosis and issue resolution.`;
  }
  return errorMessage;
}

/**
 * if err.userError is set, it inherits from AbstractError, which are user errors not Bit errors
 * and should not be reported to Sentry.
 * reason why we don't check (err instanceof AbstractError) is that it could be thrown from a fork,
 * in which case, it loses its class and has only the fields.
 */
export function sendToAnalyticsAndSentry(err: Error) {
  const possiblyHashedError = hashErrorIfNeeded(err);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
  const errorDefinition = findErrorDefinition(err);
  const getErrMsg = (): string => {
    if (err instanceof BitError) {
      return err.report();
    }
    if (!errorDefinition) {
      return handleNonBitCustomErrors(err);
    }
    const func = getErrorFunc(errorDefinition);
    const errorMessage = getErrorMessage(err, func) || 'unknown error';
    err.message = errorMessage;
    return errorMessage;
  };
  sendToAnalyticsAndSentry(err);
  const errorMessage = getErrMsg();
  return { message: chalk.red(errorMessage), error: err };
};
