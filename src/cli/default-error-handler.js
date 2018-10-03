// @flow
// all errors that the command does not handle comes to this switch statement
// if you handle the error, then return true
import chalk from 'chalk';
import { InvalidBitId, InvalidIdChunk, InvalidName, InvalidScopeName } from '../bit-id/exceptions';
import {
  ConsumerAlreadyExists,
  NothingToImport,
  ConsumerNotFound,
  ComponentSpecsFailed,
  MissingDependencies,
  NewerVersionFound,
  LoginFailed
} from '../consumer/exceptions';
import { DriverNotFound } from '../driver';
import ComponentNotFoundInPath from '../consumer/component/exceptions/component-not-found-in-path';
import MissingFilesFromComponent from '../consumer/component/exceptions/missing-files-from-component';
import PluginNotFound from '../consumer/component/exceptions/plugin-not-found';
import PermissionDenied from '../scope/network/exceptions/permission-denied';
import {
  NetworkError,
  UnexpectedNetworkError,
  SSHInvalidResponse,
  ProtocolNotSupported,
  RemoteScopeNotFound,
  AuthenticationFailed
} from '../scope/network/exceptions';
import RemoteNotFound from '../remotes/exceptions/remote-not-found';
import {
  ScopeNotFound,
  ScopeJsonNotFound,
  ResolutionException,
  ComponentNotFound,
  DependencyNotFound,
  CorruptedComponent,
  VersionAlreadyExists,
  MergeConflict,
  HashMismatch,
  MergeConflictOnRemote,
  VersionNotFound,
  CyclicDependencies,
  HashNotFound
} from '../scope/exceptions';
import InvalidBitJson from '../consumer/bit-json/exceptions/invalid-bit-json';
import InvalidVersion from '../api/consumer/lib/exceptions/invalid-version';
import NothingToCompareTo from '../api/consumer/lib/exceptions/nothing-to-compare-to';
import PromptCanceled from '../prompts/exceptions/prompt-canceled';
import IdExportedAlready from '../api/consumer/lib/exceptions/id-exported-already';
import FileSourceNotFound from '../consumer/component/exceptions/file-source-not-found';
import { MissingMainFile, MissingBitMapComponent, InvalidBitMap } from '../consumer/bit-map/exceptions';
import logger from '../logger/logger';
import RemoteUndefined from './commands/exceptions/remote-undefined';
import AddTestsWithoutId from './commands/exceptions/add-tests-without-id';
import componentIssuesTemplate from './templates/component-issues-template';
import newerVersionTemplate from './templates/newer-version-template';
import {
  PathsNotExist,
  IncorrectIdForImportedComponent,
  DuplicateIds,
  NoFiles,
  EmptyDirectory,
  MissingComponentIdForImportedComponent,
  VersionShouldBeRemoved,
  TestIsDirectory,
  MainFileIsDir,
  ExcludedMainFile
} from '../consumer/component-ops/add-components/exceptions';
import { Analytics, LEVEL } from '../analytics/analytics';
import ExternalTestErrors from '../consumer/component/exceptions/external-test-errors';
import ExternalBuildErrors from '../consumer/component/exceptions/external-build-errors';
import InvalidCompilerInterface from '../consumer/component/exceptions/invalid-compiler-interface';
import ExtensionFileNotFound from '../extensions/exceptions/extension-file-not-found';
import ExtensionNameNotValid from '../extensions/exceptions/extension-name-not-valid';
import GeneralError from '../error/general-error';
import ValidationError from '../error/validation-error';
import AbstractError from '../error/abstract-error';
import { PathToNpmrcNotExist, WriteToNpmrcError } from '../consumer/login/exceptions';
import ExtensionLoadError from '../extensions/exceptions/extension-load-error';
import ExtensionGetDynamicPackagesError from '../extensions/exceptions/extension-get-dynamic-packages-error';
import ExtensionInitError from '../extensions/exceptions/extension-init-error';
import MainFileRemoved from '../consumer/component/exceptions/main-file-removed';
import InvalidConfigDir from '../consumer/bit-map/exceptions/invalid-config-dir';
import EjectToWorkspace from '../consumer/component/exceptions/eject-to-workspace';
import EjectBoundToWorkspace from '../consumer/component/exceptions/eject-bound-to-workspace';
import EjectNoDir from '../consumer/component-ops/exceptions/eject-no-dir';
import { COMPONENT_DIR } from '../constants';
import InjectNonEjected from '../consumer/component/exceptions/inject-non-ejected';
import ExtensionSchemaError from '../extensions/exceptions/extension-schema-error';

const errorsMap: Array<[Class<Error>, (err: Class<Error>) => string]> = [
  [
    RemoteUndefined,
    () =>
      chalk.red(
        'error: remote url must be defined. please use: `ssh://`, `file://` or `bit://` protocols to define remote access'
      )
  ],
  [
    AddTestsWithoutId,
    () =>
      chalk.yellow(
        `please specify a component ID to add test files to an existing component. \n${chalk.bold(
          'example: bit add --tests [test_file_path] --id [component_id]'
        )}`
      )
  ],
  [ConsumerAlreadyExists, () => 'workspace already exists'],
  [GeneralError, err => `${err.msg}`],

  [VersionAlreadyExists, err => `error: version ${err.version} already exists for ${err.componentId}`],
  [ConsumerNotFound, () => 'workspace not found. to initiate a new workspace, please use `bit init`'],
  [LoginFailed, () => 'error: there was a problem with web authentication'],

  // [
  //   PluginNotFound,
  //   err => `error: The compiler "${err.plugin}" is not installed, please use "bit install ${err.plugin}" to install it.`
  // ],
  [FileSourceNotFound, err => `file or directory "${err.path}" was not found`],
  [ExtensionFileNotFound, err => `file "${err.path}" was not found`],
  [
    ExtensionNameNotValid,
    err =>
      `error: the extension name "${
        err.name
      }" is not a valid component id (it must contain a scope name) fix it on your bit.json file`
  ],
  [
    ProtocolNotSupported,
    () => 'error: remote scope protocol is not supported, please use: `ssh://`, `file://` or `bit://`'
  ],
  [RemoteScopeNotFound, err => `error: remote scope "${chalk.bold(err.name)}" was not found.`],
  [InvalidBitId, () => 'error: component ID is invalid, please use the following format: [scope]/<name>'],
  [InvalidConfigDir, err => `error: the eject path is already part of "${chalk.bold(err.compId)}" path`],
  [EjectToWorkspace, () => 'error: could not eject config to the workspace root please provide a valid path'],
  [
    EjectBoundToWorkspace,
    () => 'error: could not eject config for authored component which are bound to the workspace configuration'
  ],
  [InjectNonEjected, () => 'error: could not inject config for already injected component'],
  [
    EjectNoDir,
    err =>
      `error: could not eject config for ${chalk.bold(
        err.compId
      )}, please provide path which doesn't contain {${COMPONENT_DIR}} to eject`
  ],
  [
    ComponentNotFound,
    (err) => {
      const msg = err.dependentId
        ? `error: the component dependency "${chalk.bold(err.id)}" required by "${chalk.bold(
          err.dependentId
        )}" was not found`
        : `error: component "${chalk.bold(err.id)}" was not found`;
      return msg;
    }
  ],
  [
    CorruptedComponent,
    err =>
      `error: the model representation of "${chalk.bold(err.id)}" is corrupted, the object of version ${
        err.version
      } is missing. please report this issue on Github https://github.com/teambit/bit/issues`
  ],
  [
    DependencyNotFound,
    err =>
      `error: dependency "${chalk.bold(
        err.id
      )}" was not found. please track this component or use --ignore-unresolved-dependencies flag (not recommended)`
  ],
  [EmptyDirectory, () => chalk.yellow('directory is empty, no files to add')],
  [
    ValidationError,
    err => `${err.message}\nThis error should have never happened. Please open a new Github issue with the bug details`
  ],
  [ComponentNotFoundInPath, err => `error: component in path "${chalk.bold(err.path)}" was not found`],
  [
    PermissionDenied,
    err =>
      `error: permission to scope ${
        err.scope
      } was denied\nsee troubleshooting at https://docs.bitsrc.io/docs/authentication-issues.html`
  ],
  [RemoteNotFound, err => `error: remote "${chalk.bold(err.name)}" was not found`],
  [NetworkError, err => `error: remote failed with error the following error:\n "${chalk.bold(err.remoteErr)}"`],
  [
    HashMismatch,
    err => `found hash mismatch of ${chalk.bold(err.id)}, version ${chalk.bold(err.version)}.
  originalHash: ${chalk.bold(err.originalHash)}.
  currentHash: ${chalk.bold(err.currentHash)}
  this usually happens when a component is old and the migration script was not running or interrupted`
  ],
  [HashNotFound, err => `hash ${chalk.bold(err.hash)} not found`],
  [
    MergeConflict,
    err =>
      `error: merge conflict occurred while importing the component ${err.id}. conflict version(s): ${err.versions.join(
        ', '
      )}
to resolve it and merge your local and remote changes, please do the following:
1) bit untag ${err.id} ${err.versions.join(' ')}
2) bit import
3) bit checkout ${err.versions.join(' ')} ${err.id}
once your changes are merged with the new remote version, you can tag and export a new version of the component to the remote scope.`
  ],
  [
    MergeConflictOnRemote,
    err =>
      `error: merge conflict occurred when exporting the component(s) ${err.idsAndVersions
        .map(i => `${chalk.bold(i.id)} (version(s): ${i.versions.join(', ')})`)
        .join(', ')} to the remote scope.
to resolve this conflict and merge your remote and local changes, please do the following:
1) bit untag [id] [version]
2) bit import
3) bit checkout [version] [id]
once your changes are merged with the new remote version, please tag and export a new version of the component to the remote scope.`
  ],
  [CyclicDependencies, err => `${err.msg.toString().toLocaleLowerCase()}`],
  [
    UnexpectedNetworkError,
    err => `error: unexpected network error has occurred. ${err.message ? ` original message: ${err.message}` : ''}`
  ],
  [SSHInvalidResponse, () => 'error: received an invalid response from the remote SSH server'],
  [ScopeNotFound, () => 'error: workspace not found. to create a new workspace, please use `bit init`'],
  [
    ScopeJsonNotFound,
    err =>
      `error: scope.json file was not found at ${chalk.bold(err.path)}, please use ${chalk.bold(
        'bit init'
      )} to recreate the file`
  ],
  [
    ComponentSpecsFailed,
    err =>
      `${
        err.specsResultsAndIdPretty
      }component tests failed. please make sure all tests pass before tagging a new version or use the "--force" flag to force-tag components.\nto view test failures, please use the "--verbose" flag or use the "bit test" command`
  ],
  [
    MissingDependencies,
    (err) => {
      const missingDepsColored = componentIssuesTemplate(err.components);
      return `error: issues found with the following component dependencies\n${missingDepsColored}`;
    }
  ],
  [
    NothingToImport,
    () =>
      chalk.yellow(
        'nothing to import. please use `bit import [component_id]` or configure your dependencies in bit.json'
      )
  ],
  [
    InvalidIdChunk,
    err =>
      `error: "${chalk.bold(
        err.id
      )}" is invalid, component IDs can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]`
  ],
  [
    InvalidName,
    err =>
      `error: "${chalk.bold(
        err.componentName
      )}" is invalid, component names can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!", "/"]`
  ],
  [
    InvalidScopeName,
    err =>
      `error: "${chalk.bold(
        err.scopeName
      )}" is invalid, component scope names can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]`
  ],
  [
    InvalidBitJson,
    err => `error: invalid bit.json: ${chalk.bold(err.path)} is not a valid JSON file.
    consider running ${chalk.bold('bit init --reset')} to recreate the file`
  ],
  [
    DriverNotFound,
    err =>
      `error: a client-driver ${chalk.bold(err.driver)} is missing for the language ${chalk.bold(
        err.lang
      )} set in your bit.json file.`
  ],
  [
    MissingMainFile,
    err =>
      'error: one or more of the added components does not contain a main file.\nplease either use --id to group all added files as one component or use our DSL to define the main file dynamically.\nsee troubleshooting at https://docs.bitsrc.io/docs/isolating-and-tracking-components.html#define-a-components-main-file'
  ],
  [
    InvalidBitMap,
    err =>
      `error: unable to parse your bitMap file at ${chalk.bold(err.path)}, due to an error ${chalk.bold(
        err.errorMessage
      )}.
      consider running ${chalk.bold('bit init --reset')} to recreate the file`
  ],
  [ExcludedMainFile, err => `error: main file ${chalk.bold(err.mainFile)} was excluded from file list`],
  [
    MainFileRemoved,
    err => `error: main file ${chalk.bold(err.mainFile)} was removed from ${chalk.bold(err.id)}.
please use "bit remove" to delete the component or "bit add" with "--main" and "--id" flags to add a new mainFile`
  ],
  [
    VersionShouldBeRemoved,
    err => `please remove the version part from the specified id ${chalk.bold(err.id)} and try again`
  ],
  [
    TestIsDirectory,
    err =>
      `error: the specified test path ${chalk.bold(err.path)} is a directory, please specify a file or a pattern DSL`
  ],
  [
    MainFileIsDir,
    err =>
      `error: the specified main path ${chalk.bold(
        err.mainFile
      )} is a directory, please specify a file or a pattern DSL`
  ],
  [
    MissingFilesFromComponent,
    (err) => {
      return `component ${
        err.id
      } is invalid as part or all of the component files were deleted. please use \'bit remove\' to resolve the issue`;
    }
  ],
  [
    MissingBitMapComponent,
    err =>
      `error: component "${chalk.bold(
        err.id
      )}" was not found on your local workspace.\nplease specify a valid component ID or track the component using 'bit add' (see 'bit add --help' for more information)`
  ],
  [PathsNotExist, err => `error: file or directory "${chalk.bold(err.paths.join(', '))}" was not found.`],
  [WriteToNpmrcError, err => `unable to add @bit as a scoped registry at "${chalk.bold(err.path)}"`],
  [PathToNpmrcNotExist, err => `error: file or directory "${chalk.bold(err.path)}" was not found.`],

  [VersionNotFound, err => `error: version "${chalk.bold(err.version)}" was not found.`],
  [
    MissingComponentIdForImportedComponent,
    err =>
      `error: unable to add new files to the component "${chalk.bold(
        err.id
      )}" without specifying a component ID. please define the component ID using the --id flag.`
  ],
  [
    IncorrectIdForImportedComponent,
    err =>
      `error: trying to add a file ${chalk.bold(err.filePath)} to a component-id "${chalk.bold(
        err.newId
      )}", however, this file already belong to "${chalk.bold(err.importedId)}"`
  ],
  [
    NoFiles,
    err =>
      chalk.yellow('warning: no files to add') +
      chalk.yellow(err.ignoredFiles ? `, the following files were ignored: ${chalk.bold(err.ignoredFiles)}` : '')
  ],
  [
    DuplicateIds,
    err =>
      Object.keys(err.componentObject)
        .map((key) => {
          return `unable to add ${
            Object.keys(err.componentObject[key]).length
          } components with the same ID: ${chalk.bold(key)} : ${err.componentObject[key]}\n`;
        })
        .join(' ')
  ],

  [IdExportedAlready, err => `component ${chalk.bold(err.id)} has been already exported to ${chalk.bold(err.remote)}`],
  [
    InvalidVersion,
    err => `error: version ${chalk.bold(err.version)} is not a valid semantic version. learn more: https://semver.org`
  ],
  [NothingToCompareTo, err => 'no previous versions to compare'],
  [
    NewerVersionFound,
    // err => JSON.stringify(err.newerVersions)
    err => newerVersionTemplate(err.newerVersions)
  ],
  [PromptCanceled, err => chalk.yellow('operation aborted')],
  [
    ExternalTestErrors,
    err =>
      `error: bit failed to test ${err.id} with the following exception:\n${getExternalErrorsMessageAndStack(
        err.originalErrors
      )}`
  ],
  [
    ExternalBuildErrors,
    err =>
      `error: bit failed to build ${err.id} with the following exception:\n${getExternalErrorsMessageAndStack(
        err.originalErrors
      )}`
  ],
  [
    ExtensionLoadError,
    err =>
      `error: bit failed to load ${err.name} with the following exception:\n${getExternalErrorMessage(
        err.originalError
      )}.\n${err.printStack ? err.originalError.stack : ''}`
  ],
  [
    ExtensionSchemaError,
    err => `error: configuration passed to extension ${chalk.bold(err.extensionName)} is invalid:\n${err.errors}`
  ],
  [
    ExtensionInitError,
    err =>
      `error: bit failed to initialized ${err.name} with the following exception:\n${getExternalErrorMessage(
        err.originalError
      )}.\n${err.originalError.stack}`
  ],
  [
    ExtensionGetDynamicPackagesError,
    err =>
      `error: bit failed to get the dynamic packages from ${err.name} with the following exception:\n${
        err.originalError.message
      }.\n${err.originalError.stack}`
  ],
  [
    InvalidCompilerInterface,
    err => `"${err.compilerName}" does not have a valid compiler interface, it has to expose a compile method`
  ],
  [
    ResolutionException,
    err =>
      `error: bit failed to require ${err.filePath} due to the following exception:\n${getExternalErrorMessage(
        err.originalError
      )}.\n${err.originalError.stack}`
  ],
  [
    AuthenticationFailed,
    err => 'authentication failed. see troubleshooting at https://docs.bitsrc.io/docs/authentication-issues.html'
  ]
];

function formatUnhandled(err: Error): string {
  Analytics.setError(LEVEL.FATAL, err);
  return chalk.red(err.message || err);
}

function findErrorDefinition(err: Error) {
  const error = errorsMap.find(([ErrorType]) => {
    return err instanceof ErrorType || err.name === ErrorType.name; // in some cases, such as forked process, the received err is serialized.
  });
  return error;
}

function getErrorFunc(errorDefinition) {
  if (!errorDefinition) return null;
  const [, func] = errorDefinition;
  return func;
}

function getErrorMessage(error: ?Error, func: ?Function): string {
  if (!error || !func) return '';
  const errorMessage = func(error);
  return errorMessage;
}

function getExternalErrorMessage(externalError: ?Error): string {
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

export default (err: Error): ?string => {
  const errorDefinition = findErrorDefinition(err);

  if (!errorDefinition) return formatUnhandled(err);
  /* this is an error that bit knows how to handle dont send to sentry */

  if (err instanceof AbstractError) {
    Analytics.setError(LEVEL.INFO, err.makeAnonymous());
  } else {
    Analytics.setError(LEVEL.FATAL, err);
  }
  const func = getErrorFunc(errorDefinition);
  const errorMessage = getErrorMessage(err, func) || 'unknown error';
  err.message = errorMessage;
  logger.error(`User gets the following error: ${errorMessage}`);
  return chalk.red(errorMessage);
};
