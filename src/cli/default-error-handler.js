// @flow
// all errors that the command does not handle comes to this switch statement
// if you handle the error, then return true
import chalk from 'chalk';
import { InvalidBitId, InvalidIdChunk } from '../bit-id/exceptions';
import BitAlreadyExistExternaly from '../consumer/component/exceptions/bit-already-exist-externaly';
import {
  ConsumerAlreadyExists,
  NothingToImport,
  ConsumerNotFound,
  ComponentSpecsFailed,
  MissingDependencies,
  NewerVersionFound
} from '../consumer/exceptions';
import { DriverNotFound } from '../driver';
import ComponentNotFoundInPath from '../consumer/component/exceptions/component-not-found-in-path';
import BuildException from '../consumer/component/exceptions/build-exception';
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
  ResolutionException,
  ComponentNotFound,
  DependencyNotFound,
  CorruptedComponent,
  VersionAlreadyExists,
  MergeConflict,
  MergeConflictOnRemote,
  CyclicDependencies
} from '../scope/exceptions';
import InvalidBitJson from '../consumer/bit-json/exceptions/invalid-bit-json';
import InvalidVersion from '../api/consumer/lib/exceptions/invalid-version';
import NothingToCompareTo from '../api/consumer/lib/exceptions/nothing-to-compare-to';
import PromptCanceled from '../prompts/exceptions/prompt-canceled';
import IdExportedAlready from '../api/consumer/lib/exceptions/id-exported-already';
import FileSourceNotFound from '../consumer/component/exceptions/file-source-not-found';
import { MissingMainFile, MissingBitMapComponent } from '../consumer/bit-map/exceptions';
import logger from '../logger/logger';
import RemoteUndefined from './commands/exceptions/remote-undefined';
import AddTestsWithoutId from './commands/exceptions/add-tests-without-id';
import missingDepsTemplate from './templates/missing-dependencies-template';
import {
  PathsNotExist,
  IncorrectIdForImportedComponent,
  DuplicateIds,
  NoFiles,
  EmptyDirectory,
  MissingComponentIdForImportedComponent,
  ExcludedMainFile
} from '../consumer/component/add-components/exceptions';
import { Analytics, LEVEL } from '../analytics/analytics';

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
  [VersionAlreadyExists, err => `error: version ${err.version} already exists for ${err.componentId}`],
  [ConsumerNotFound, () => 'workspace not found. to initiate a new workspace, please use `bit init`'],
  // [
  //   PluginNotFound,
  //   err => `error: The compiler "${err.plugin}" is not installed, please use "bit install ${err.plugin}" to install it.`
  // ],
  [FileSourceNotFound, err => `file or directory "${err.path}" was not found`],
  [
    ProtocolNotSupported,
    () => 'error: remote scope protocol is not supported, please use: `ssh://`, `file://` or `bit://`'
  ],
  [RemoteScopeNotFound, err => `error: remote scope "${chalk.bold(err.name)}" was not found.`],
  [InvalidBitId, () => 'error: component ID is invalid, please use the following format: [scope]/[namespace]/<name>'],
  [ComponentNotFound, err => `error: component "${chalk.bold(err.id)}" was not found`],
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
      )}" was not found. please track this component or use --ignore-missing-dependencies flag (not recommended)`
  ],
  [EmptyDirectory, () => chalk.yellow('directory is empty, no files to add')],
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
    MergeConflict,
    err =>
      `error: merge conflict occurred while importing the component ${err.id}. conflict version(s): ${err.versions.join(
        ', '
      )}
to resolve it and merge your local and remote changes, please do the following:
1) bit untag ${err.id} ${err.versions.join(' ')}
2) bit import
3) bit checkout ${err.versions.join(' ')} ${err.id}`
  ],
  [
    MergeConflictOnRemote,
    err =>
      `error: merge conflict occurred when exporting the component ${err.id} to the remote scope.
to resolve this conflict and merge your remote and local changes, please do the following:
1) bit untag ${err.id} ${err.versions.join(' ')}
2) bit import
3) bit checkout {conflict-version} ${err.id}
once your changes are merged with the new remote version, please tag and export a new version of the component to the remote scope.`
  ],
  [CyclicDependencies, err => `${err.msg.toString().toLocaleLowerCase()}`],
  [UnexpectedNetworkError, () => 'error: unexpected network error has occurred'],
  [SSHInvalidResponse, () => 'error: received an invalid response from the remote SSH server'],
  [ScopeNotFound, () => 'error: workspace not found. to create a new workspace, please use `bit init`'],
  [ComponentSpecsFailed, () => "component's tests has failed, please fix them before tagging"],
  [
    BuildException,
    err => `error: bit failed to build ${err.id} with the following exception:\n ${err.message} \n ${err.stack || ''}`
  ],
  [
    MissingDependencies,
    (err) => {
      const missingDepsColored = missingDepsTemplate(err.components);
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
  [InvalidBitJson, err => `error: invalid bit.json: ${chalk.bold(err.path)} is not a valid JSON file.`],

  [ResolutionException, e => e.message],
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
  [ExcludedMainFile, err => `error: main file ${chalk.bold(err.mainFile)} was excluded from file list`],
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
      `error: unable to add new files from the root directory of the component  "${chalk.bold(
        err.importedId
      )}" to "${chalk.bold(err.newId)}"`
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
    err => `unable to tag ${err.componentId}
current version ${err.currentVersion} is older than the latest ${err.newestVersion}.
to ignore this error, please use --ignore-newest-version flag`
  ],
  [PromptCanceled, err => chalk.yellow('operation was aborted')],
  [
    AuthenticationFailed,
    err => 'authentication failed. see troubleshooting at https://docs.bitsrc.io/docs/authentication-issues.html'
  ]
];

function formatUnhandled(err: Error): string {
  Analytics.setError(LEVEL.FATAL, err);
  return chalk.red(err.message || err);
}

export default (err: Error): ?string => {
  const error = errorsMap.find(([ErrorType]) => {
    return err instanceof ErrorType;
  });

  if (!error) return formatUnhandled(err);
  /* this is an error that bit knows how to handle dont send to sentry */

  Analytics.setError(LEVEL.INFO, err.makeAnonymous());
  const [, func] = error;
  logger.error(`User gets the following error: ${func(err)}`);
  return chalk.red(func(err));
};
