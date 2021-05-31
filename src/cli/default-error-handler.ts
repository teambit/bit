// all errors that the command does not handle comes to this switch statement
// if you handle the error, then return true
import chalk from 'chalk';
import { BitError } from '@teambit/bit-error';
import { Analytics, LEVEL } from '../analytics/analytics';
import ConfigKeyNotFound from '../api/consumer/lib/exceptions/config-key-not-found';
import DiagnosisNotFound from '../api/consumer/lib/exceptions/diagnosis-not-found';
import FlagHarmonyOnly from '../api/consumer/lib/exceptions/flag-harmony-only';
import IdExportedAlready from '../api/consumer/lib/exceptions/id-exported-already';
import InvalidVersion from '../api/consumer/lib/exceptions/invalid-version';
import MissingDiagnosisName from '../api/consumer/lib/exceptions/missing-diagnosis-name';
import NoIdMatchWildcard from '../api/consumer/lib/exceptions/no-id-match-wildcard';
import NothingToCompareTo from '../api/consumer/lib/exceptions/nothing-to-compare-to';
import ObjectsWithoutConsumer from '../api/consumer/lib/exceptions/objects-without-consumer';
import { BASE_DOCS_DOMAIN, DEBUG_LOG, IMPORT_PENDING_MSG } from '../constants';
import { InvalidBitMap, MissingMainFile } from '../consumer/bit-map/exceptions';
import OutsideRootDir from '../consumer/bit-map/exceptions/outside-root-dir';
import {
  DuplicateIds,
  ExcludedMainFile,
  IncorrectIdForImportedComponent,
  MainFileIsDir,
  MissingComponentIdForImportedComponent,
  MissingMainFileMultipleComponents,
  NoFiles,
  PathOutsideConsumer,
  PathsNotExist,
  TestIsDirectory,
  VersionShouldBeRemoved,
} from '../consumer/component-ops/add-components/exceptions';
import { AddingIndividualFiles } from '../consumer/component-ops/add-components/exceptions/adding-individual-files';
import ComponentsPendingImport from '../consumer/component-ops/exceptions/components-pending-import';
import ComponentsPendingMerge from '../consumer/component-ops/exceptions/components-pending-merge';
import EjectNoDir from '../consumer/component-ops/exceptions/eject-no-dir';
import ComponentNotFoundInPath from '../consumer/component/exceptions/component-not-found-in-path';
import EjectBoundToWorkspace from '../consumer/component/exceptions/eject-bound-to-workspace';
import ExternalBuildErrors from '../consumer/component/exceptions/external-build-errors';
import ExternalTestErrors from '../consumer/component/exceptions/external-test-errors';
import { FailedLoadForTag } from '../consumer/component/exceptions/failed-load-for-tag';
import FileSourceNotFound from '../consumer/component/exceptions/file-source-not-found';
import InjectNonEjected from '../consumer/component/exceptions/inject-non-ejected';
import InvalidCompilerInterface from '../consumer/component/exceptions/invalid-compiler-interface';
import MainFileRemoved from '../consumer/component/exceptions/main-file-removed';
import MissingFilesFromComponent from '../consumer/component/exceptions/missing-files-from-component';
import { NoComponentDir } from '../consumer/component/exceptions/no-component-dir';
import InvalidBitJson from '../consumer/config/exceptions/invalid-bit-json';
import InvalidConfigPropPath from '../consumer/config/exceptions/invalid-config-prop-path';
import InvalidPackageJson from '../consumer/config/exceptions/invalid-package-json';
import InvalidPackageManager from '../consumer/config/exceptions/invalid-package-manager';
import {
  ComponentOutOfSync,
  ComponentSpecsFailed,
  ConsumerAlreadyExists,
  ConsumerNotFound,
  LoginFailed,
  MissingDependencies,
  NewerVersionFound,
  NothingToImport,
} from '../consumer/exceptions';
import { LanesIsDisabled } from '../consumer/lanes/exceptions/lanes-is-disabled';
import { PathToNpmrcNotExist, WriteToNpmrcError } from '../consumer/login/exceptions';
import GeneralError from '../error/general-error';
import hashErrorIfNeeded from '../error/hash-error-object';
import ValidationError from '../error/validation-error';
import ExtensionFileNotFound from '../legacy-extensions/exceptions/extension-file-not-found';
import ExtensionGetDynamicConfigError from '../legacy-extensions/exceptions/extension-get-dynamic-config-error';
import ExtensionGetDynamicPackagesError from '../legacy-extensions/exceptions/extension-get-dynamic-packages-error';
import ExtensionInitError from '../legacy-extensions/exceptions/extension-init-error';
import ExtensionLoadError from '../legacy-extensions/exceptions/extension-load-error';
import ExtensionNameNotValid from '../legacy-extensions/exceptions/extension-name-not-valid';
import ExtensionSchemaError from '../legacy-extensions/exceptions/extension-schema-error';
import logger from '../logger/logger';
import PromptCanceled from '../prompts/exceptions/prompt-canceled';
import RemoteNotFound from '../remotes/exceptions/remote-not-found';
import {
  ComponentNotFound,
  CorruptedComponent,
  CyclicDependencies,
  HashMismatch,
  HashNotFound,
  HeadNotFound,
  InvalidIndexJson,
  OutdatedIndexJson,
  ParentNotFound,
  ResolutionException,
  ScopeJsonNotFound,
  ScopeNotFound,
  VersionAlreadyExists,
} from '../scope/exceptions';
import {
  AuthenticationFailed,
  NetworkError,
  ProtocolNotSupported,
  RemoteScopeNotFound,
  SSHInvalidResponse,
  UnexpectedNetworkError,
} from '../scope/network/exceptions';
import ExportAnotherOwnerPrivate from '../scope/network/exceptions/export-another-owner-private';
import RemoteResolverError from '../scope/network/exceptions/remote-resolver-error';
import GitNotFound from '../utils/git/exceptions/git-not-found';
import { paintSpecsResults } from './chalk-box';
import AddTestsWithoutId from './commands/exceptions/add-tests-without-id';
import RemoteUndefined from './commands/exceptions/remote-undefined';
import componentIssuesTemplate from './templates/component-issues-template';
import newerVersionTemplate from './templates/newer-version-template';

const reportIssueToGithubMsg =
  'This error should have never happened. Please report this issue on Github https://github.com/teambit/bit/issues';

// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
const errorsMap: Array<[Class<Error>, (err: Class<Error>) => string]> = [
  [
    RemoteUndefined,
    () =>
      chalk.red(
        'error: remote url must be defined. please use: `ssh://`, `file://` or `bit://` protocols to define remote access'
      ),
  ],
  [
    AddTestsWithoutId,
    () =>
      chalk.yellow(
        `please specify a component ID to add test files to an existing component. \n${chalk.bold(
          'example: bit add --tests [test_file_path] --id [component_id]'
        )}`
      ),
  ],
  [ConsumerAlreadyExists, () => 'workspace already exists'],
  [GeneralError, (err) => `${err.msg}`],

  [VersionAlreadyExists, (err) => `error: version ${err.version} already exists for ${err.componentId}`],
  [ConsumerNotFound, () => 'workspace not found. to initiate a new workspace, please use `bit init`'],
  [LoginFailed, () => 'error: there was a problem with web authentication'],

  // [
  //   PluginNotFound,
  //   err => `error: The compiler "${err.plugin}" is not installed, please use "bit install ${err.plugin}" to install it.`
  // ],
  [FileSourceNotFound, (err) => `file or directory "${err.path}" was not found`],
  [LanesIsDisabled, () => `lanes/snaps features are disabled. upgrade your workspace to Harmony to enable them`],
  [
    OutsideRootDir,
    (err) => `unable to add file ${err.filePath} because it's located outside the component root dir ${err.rootDir}`,
  ],
  [
    AddingIndividualFiles,
    (err) => `error: adding individual files is blocked ("${err.file}"), and only directories can be added`,
  ],
  [ExtensionFileNotFound, (err) => `file "${err.path}" was not found`],
  [
    ExtensionNameNotValid,
    (err) =>
      `error: the extension name "${err.name}" is not a valid component id (it must contain a scope name) fix it on your bit.json file`,
  ],
  [
    ProtocolNotSupported,
    () =>
      'error: remote scope protocol is not supported, please use: `ssh://`, `file://`, `http://`, `https://` or `bit://`',
  ],
  [RemoteScopeNotFound, (err) => `error: remote scope "${chalk.bold(err.name)}" was not found.`],

  [
    EjectBoundToWorkspace,
    () => 'error: could not eject config for authored component which are bound to the workspace configuration',
  ],
  [InjectNonEjected, () => 'error: could not inject config for already injected component'],
  [ComponentsPendingImport, () => IMPORT_PENDING_MSG],
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
    EjectNoDir,
    (err) =>
      `error: could not eject config for ${chalk.bold(err.compId)}, please make sure it's under a track directory`,
  ],
  [
    ComponentNotFound,
    (err) => {
      const baseMsg = err.dependentId
        ? `error: the component dependency "${chalk.bold(err.id)}" required by "${chalk.bold(
            err.dependentId
          )}" was not found`
        : `error: component "${chalk.bold(err.id)}" was not found`;
      const msg = `${baseMsg}\nconsider running "bit dependents ${err.id}" to understand why this component was needed`;
      return msg;
    },
  ],
  [
    CorruptedComponent,
    (err) =>
      `error: the model representation of "${chalk.bold(err.id)}" is corrupted, the object of version ${
        err.version
      } is missing.\n${reportIssueToGithubMsg}`,
  ],
  [ValidationError, (err) => `${err.message}\n${reportIssueToGithubMsg}`],
  [ComponentNotFoundInPath, (err) => `error: component in path "${chalk.bold(err.path)}" was not found`],
  [RemoteNotFound, (err) => `error: remote "${chalk.bold(err.name)}" was not found`],
  [NetworkError, (err) => `error: remote failed with error the following error:\n "${chalk.bold(err.remoteErr)}"`],
  [
    HashMismatch,
    (err) => `found hash mismatch of ${chalk.bold(err.id)}, version ${chalk.bold(err.version)}.
  originalHash: ${chalk.bold(err.originalHash)}.
  currentHash: ${chalk.bold(err.currentHash)}
  this usually happens when a component is old and the migration script was not running or interrupted`,
  ],
  [HashNotFound, (err) => `hash ${chalk.bold(err.hash)} not found`],
  [HeadNotFound, (err) => `head snap ${chalk.bold(err.headHash)} was not found for a component ${chalk.bold(err.id)}`],
  [
    OutdatedIndexJson,
    (err) => `error: ${chalk.bold(err.id)} found in the index.json file, however, is missing from the scope.
the cache is deleted and will be rebuilt on the next command. please re-run the command.`,
  ],
  [CyclicDependencies, (err) => `${err.msg.toString().toLocaleLowerCase()}`],
  [
    UnexpectedNetworkError,
    (err) => `unexpected network error has occurred.
${err.message ? `server responded with: "${err.message}"` : ''}`,
  ],
  [
    RemoteResolverError,
    (err) => `error: ${err.message ? `${err.message}` : 'unexpected remote resolver error has occurred'}`,
  ],
  [
    ExportAnotherOwnerPrivate,
    (
      err
    ) => `error: unable to export components to ${err.destinationScope} because they have dependencies on components in ${err.sourceScope}.
bit does not allow setting dependencies between components in private collections managed by different owners.

see troubleshooting at https://${BASE_DOCS_DOMAIN}/docs/bit-dev#permissions-for-collections`,
  ],
  [
    SSHInvalidResponse,
    () => `error: received an invalid response from the remote SSH server.
to see the invalid response, have a look at the log, located at ${DEBUG_LOG}`,
  ],
  [
    InvalidIndexJson,
    (err) => `fatal: your .bit/index.json is not a valid JSON file.
To rebuild the file, please run ${chalk.bold('bit init --reset')}.
Original Error: ${err.message}`,
  ],
  [ScopeNotFound, (err) => `error: scope not found at ${chalk.bold(err.scopePath)}`],
  [
    ScopeJsonNotFound,
    (err) =>
      `error: scope.json file was not found at ${chalk.bold(err.path)}, please use ${chalk.bold(
        'bit init'
      )} to recreate the file`,
  ],
  [MissingDiagnosisName, () => 'error: please provide a diagnosis name'],
  [DiagnosisNotFound, (err) => `error: diagnosis ${chalk.bold(err.diagnosisName)} not found`],
  [ComponentSpecsFailed, (err) => formatComponentSpecsFailed(err.id, err.specsResults)],
  [
    ComponentOutOfSync,
    (err) => `component ${chalk.bold(err.id)} is not in-sync between the consumer and the scope.
if it is originated from another git branch, go back to that branch to continue working on the component.
if possible, remove the component using "bit remove" and re-import or re-create it.
to re-start Bit from scratch, deleting all objects from the scope, use "bit init --reset-hard"`,
  ],
  [
    MissingDependencies,
    (err) => {
      const missingDepsColored = componentIssuesTemplate(err.components);
      return `error: issues found with the following component dependencies\n${missingDepsColored}`;
    },
  ],
  [NothingToImport, () => chalk.yellow('nothing to import. please use `bit import [component_id]`')],
  [
    InvalidBitJson,
    (err) => `error: invalid bit.json: ${chalk.bold(err.path)} is not a valid JSON file.
consider running ${chalk.bold('bit init --reset')} to recreate the file`,
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
    InvalidConfigPropPath,
    (err) => `error: the path "${chalk.bold(err.fieldValue)}" of "${chalk.bold(
      err.fieldName
    )}" in your bit.json or package.json file is invalid.
please make sure it's not absolute and doesn't contain invalid characters`,
  ],
  [
    MissingMainFile,
    (err) =>
      `error: the component ${chalk.bold(
        err.componentId
      )} does not contain a main file.\nplease either use --id to group all added files as one component or use our DSL to define the main file dynamically.\nsee troubleshooting at https://${BASE_DOCS_DOMAIN}/docs/add-and-isolate-components#component-entry-points`,
  ],
  [
    NoComponentDir,
    (err) => `"${err.id}" doesn't have a component directory, which is invalid on Harmony.
please run "bit status" to get more info`,
  ],
  [
    MissingMainFileMultipleComponents,
    (err) =>
      `error: the components ${chalk.bold(
        err.componentIds.join(', ')
      )} does not contain a main file.\nplease either use --id to group all added files as one component or use our DSL to define the main file dynamically.\nsee troubleshooting at https://${BASE_DOCS_DOMAIN}/docs/add-and-isolate-components#component-entry-point`,
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
    TestIsDirectory,
    (err) =>
      `error: the specified test path ${chalk.bold(err.path)} is a directory, please specify a file or a pattern DSL`,
  ],
  [
    MainFileIsDir,
    (err) =>
      `error: the specified main path ${chalk.bold(
        err.mainFile
      )} is a directory, please specify a file or a pattern DSL`,
  ],
  [
    MissingFilesFromComponent,
    (err) => {
      return `component ${err.id} is invalid as part or all of the component files were deleted. please use 'bit remove' to resolve the issue`;
    },
  ],
  [PathsNotExist, (err) => `error: file or directory "${chalk.bold(err.paths.join(', '))}" was not found.`],
  [
    PathOutsideConsumer,
    (err) => `error: file or directory "${chalk.bold(err.path)}" is located outside of the workspace.`,
  ],
  [ConfigKeyNotFound, (err) => `unable to find a key "${chalk.bold(err.key)}" in your bit config`],
  [FlagHarmonyOnly, (err) => `the flag: "${chalk.bold(err.flag)}" allowed only on harmony workspace`],
  [WriteToNpmrcError, (err) => `unable to add @bit as a scoped registry at "${chalk.bold(err.path)}"`],
  [PathToNpmrcNotExist, (err) => `error: file or directory "${chalk.bold(err.path)}" was not found.`],
  [
    ParentNotFound,
    (err) =>
      `component ${chalk.bold(err.id)} missing data. parent ${err.parentHash} of version ${
        err.versionHash
      } was not found.`,
  ],
  [
    MissingComponentIdForImportedComponent,
    (err) =>
      `error: unable to add new files to the component "${chalk.bold(
        err.id
      )}" without specifying a component ID. please define the component ID using the --id flag.`,
  ],
  [
    IncorrectIdForImportedComponent,
    (err) =>
      `error: trying to add a file ${chalk.bold(err.filePath)} to a component-id "${chalk.bold(
        err.newId
      )}", however, this file already belong to "${chalk.bold(err.importedId)}"`,
  ],
  [FailedLoadForTag, (err) => err.getErrorMessage()],
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
    IdExportedAlready,
    (err) => `component ${chalk.bold(err.id)} has been already exported to ${chalk.bold(err.remote)}`,
  ],
  [
    InvalidVersion,
    (err) =>
      `error: version ${chalk.bold(err.version)} is not a valid semantic version. learn more: https://semver.org`,
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
    ExternalTestErrors,
    (err) =>
      `error: bit failed to test ${err.id} with the following exception:\n${getExternalErrorsMessageAndStack(
        err.originalErrors
      )}`,
  ],
  [
    ExternalBuildErrors,
    (err) =>
      `error: bit failed to build ${err.id} with the following exception:\n${getExternalErrorsMessageAndStack(
        err.originalErrors
      )}`,
  ],
  [
    ExtensionLoadError,
    (err) =>
      `error: bit failed to load ${err.compName} with the following exception:\n${getExternalErrorMessage(
        err.originalError
      )}.\n${err.printStack ? err.originalError.stack : ''}`,
  ],
  [
    ExtensionSchemaError,
    (err) => `error: configuration passed to extension ${chalk.bold(err.extensionName)} is invalid:\n${err.errors}`,
  ],
  [
    ExtensionInitError,
    (err) =>
      `error: bit failed to initialized ${err.compName} with the following exception:\n${getExternalErrorMessage(
        err.originalError
      )}.\n${err.originalError.stack}`,
  ],
  [
    ExtensionGetDynamicPackagesError,
    (err) =>
      `error: bit failed to get the dynamic packages from ${err.compName} with the following exception:\n${err.originalError.message}.\n${err.originalError.stack}`,
  ],
  [
    ExtensionGetDynamicConfigError,
    (err) =>
      `error: bit failed to get the config from ${err.compName} with the following exception:\n${err.originalError.message}.\n${err.originalError.stack}`,
  ],
  [
    InvalidCompilerInterface,
    (err) => `"${err.compilerName}" does not have a valid compiler interface, it has to expose a compile method`,
  ],
  [
    ResolutionException,
    (err) =>
      `error: bit failed to require ${err.filePath} due to the following exception:\n${getExternalErrorMessage(
        err.originalError
      )}.\n${err.originalError.stack}`,
  ],
  [
    GitNotFound,
    () =>
      "error: unable to run command because git executable not found. please ensure git is installed and/or git_path is configured using the 'bit config set git_path <GIT_PATH>'",
  ],
  [
    AuthenticationFailed,
    (err) =>
      `authentication failed. see troubleshooting at https://${BASE_DOCS_DOMAIN}/docs/setup-authentication#autentication-issues.html\n\n${err.debugInfo}`,
  ],
  [
    ObjectsWithoutConsumer,
    (err) => `error: unable to initialize a bit workspace. bit has found undeleted local objects at ${chalk.bold(
      err.scopePath
    )}.
1. use the ${chalk.bold('--reset-hard')} flag to clear all data and initialize an empty workspace.
2. if deleted by mistake, please restore .bitmap and bit.json.
3. force workspace initialization without clearing data use the ${chalk.bold('--force')} flag.`,
  ],
];
function formatComponentSpecsFailed(id, specsResults) {
  // $FlowFixMe this.specsResults is not null at this point
  const specsResultsPretty = specsResults ? paintSpecsResults(specsResults).join('\n') : '';
  const componentIdPretty = id ? chalk.bold.white(id) : '';
  const specsResultsAndIdPretty = `${componentIdPretty}${specsResultsPretty}\n`;
  const additionalInfo =
    'component tests failed. please make sure all tests pass before tagging a new version or use the "--force" flag to force-tag components.\nto view test failures, please use the "--verbose" flag or use the "bit test" command';
  const res = `${specsResultsAndIdPretty}${additionalInfo}`;
  return res;
}

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

function getExternalErrorMessage(externalError: Error | null | undefined): string {
  if (!externalError) return '';

  // In case an error is not a real error
  if (!(externalError instanceof Error)) {
    return externalError;
  }
  // In case it's not a bit error
  if (externalError.message) {
    return externalError.message;
  }
  const errorDefinition = findErrorDefinition(externalError);
  const func = getErrorFunc(errorDefinition);
  const errorMessage = getErrorMessage(externalError, func);
  return errorMessage;
}

function getExternalErrorsMessageAndStack(errors: Error[]): string {
  const result = errors
    .map((e) => {
      const msg = getExternalErrorMessage(e);
      const stack = e.stack || '';
      return `${msg}\n${stack}\n`;
    })
    .join('~~~~~~~~~~~~~\n');
  return result;
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
  if (err.code === 'EACCES') {
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
  logger.error(`user gets the following error: ${errorMessage}`);
  return { message: chalk.red(errorMessage), error: err };
};
