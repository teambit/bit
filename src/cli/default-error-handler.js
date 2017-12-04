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
  MissingDependencies
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
  ResolutionException,
  ComponentNotFound,
  DependencyNotFound,
  CorruptedComponent,
  VersionAlreadyExists,
  MergeConflict
} from '../scope/exceptions';
import InvalidBitJson from '../consumer/bit-json/exceptions/invalid-bit-json';
import invalidIdOnCommit from '../api/consumer/lib/exceptions/invalid-id-on-commit';
import NothingToCompareTo from '../api/consumer/lib/exceptions/nothing-to-compare-to';
import PromptCanceled from '../prompts/exceptions/prompt-canceled';
import IdExportedAlready from '../api/consumer/lib/exceptions/id-exported-already';
import PathNotExists from '../api/consumer/lib/exceptions/path-not-exists';
import DuplicateIds from '../api/consumer/lib/exceptions/duplicate-ids';

import FileSourceNotFound from '../consumer/component/exceptions/file-source-not-found';
import { MissingMainFile, MissingBitMapComponent } from '../consumer/bit-map/exceptions';
import EmptyDirectory from '../api/consumer/lib/exceptions/empty-directory';
import logger from '../logger/logger';
import RemoteUndefined from './commands/exceptions/remote-undefined';
import missingDepsTemplate from './templates/missing-dependencies-template';

const errorsMap: [[Error, (err: Error) => string]] = [
  [
    RemoteUndefined,
    () =>
      chalk.red(
        'fatal: remote url must be defined. please use: `ssh://`, `file://` or `bit://` protocols to define remote access'
      )
  ],
  [ConsumerAlreadyExists, () => "there's already a scope"],
  [VersionAlreadyExists, err => `the version ${err.version} already exists for ${err.componentId}`],
  [ConsumerNotFound, () => 'fatal: scope not found. to create a new scope, please use `bit init`'],
  [
    BitAlreadyExistExternaly,
    err =>
      `fatal: component "${err.bitName}" already exists in the external library try "bit modify ${
        err.bitName
      }" to modify the current component or "bit create -f ${err.bitName}"!`
  ],
  [
    PluginNotFound,
    err => `fatal: The compiler "${err.plugin}" is not installed, please use "bit install ${err.plugin}" to install it.`
  ],
  [FileSourceNotFound, err => `fatal: the file "${err.path}" was not found!`],
  [
    ProtocolNotSupported,
    () => 'fatal: remote scope protocol is not supported, please use: `ssh://`, `file://` or `bit://`'
  ],
  [RemoteScopeNotFound, err => `fatal: remote scope "${chalk.bold(err.name)}" not found.`],
  [InvalidBitId, () => 'fatal: component ID is invalid, please use the following format: [scope]/[box]/<name>'],
  [ComponentNotFound, err => `fatal: component with id "${chalk.bold(err.id)}" was not found`],
  [
    CorruptedComponent,
    err =>
      `fatal: the model representation of "${chalk.bold(err.id)}" is corrupted, the object of version ${
        err.version
      } is missing`
  ],
  [DependencyNotFound, err => `error: Dependency "${chalk.bold(err.id)}" not found.`],
  [EmptyDirectory, () => chalk.yellow('directory is empty, no files to add')],
  [ComponentNotFoundInPath, err => `fatal: component in path "${chalk.bold(err.path)}" was not found`],
  [PermissionDenied, err => `fatal: permission to scope ${err.scope} was denied`],
  [RemoteNotFound, err => `fatal: remote "${chalk.bold(err.name)}" was not found`],
  [NetworkError, err => `fatal: remote failed with error: "${chalk.bold(err.remoteErr)}"`],
  [
    MergeConflict,
    err =>
      `error: Merge conflict occurred when exporting the component ${
        err.id
      }.\nTo resolve it, please import the latest version of the remote component, and only then export your changes.`
  ],
  [UnexpectedNetworkError, () => 'fatal: unexpected network error has occurred'],
  [SSHInvalidResponse, () => 'fatal: received an invalid response from the remote SSH server'],
  [ScopeNotFound, () => 'fatal: scope not found. to create a new scope, please use `bit init --bare`'],
  [ComponentSpecsFailed, () => "component's specs does not pass, fix them and tag"],
  [
    MissingDependencies,
    (err) => {
      const missingDepsColored = missingDepsTemplate(err.components);
      return `fatal: issues found with the following component dependencies\n${missingDepsColored}`;
    }
  ],
  [
    NothingToImport,
    () => chalk.yellow('nothing to import. please use `bit import [componentId]` or configure components in bit.json')
  ],
  [
    InvalidIdChunk,
    err =>
      `invalid id part in "${chalk.bold(
        err.id
      )}", id part can have only alphanumeric, lowercase characters, and the following ["-", "_", "$", "!", "."]`
  ],
  [InvalidBitJson, err => `error: invalid bit.json: ${chalk.bold(err.path)} is not a valid JSON file.`],

  [ResolutionException, e => e.message],
  [
    DriverNotFound,
    err =>
      `fatal: a client-driver ${chalk.bold(err.driver)} is missing for the language ${chalk.bold(
        err.lang
      )} set in your bit.json file.`
  ],
  [
    MissingMainFile,
    err =>
      `fatal: the main file ${chalk.bold(err.mainFile)} was not found in the files list ${chalk.bold(
        err.files.join(', ')
      )}`
  ],
  [
    MissingFilesFromComponent,
    (err) => {
      return `invalid component ${
        err.id
      }, all files were deleted, please remove the component using bit remove command`;
    }
  ],
  [MissingBitMapComponent, err => `fatal: the component ${chalk.bold(err.id)} was not found in the bit.map file`],
  [PathNotExists, err => `fatal: the file "${chalk.bold(err.path)}" was not found`],
  [
    DuplicateIds,
    err =>
      Object.keys(err.componentObject)
        .map((key) => {
          return `unable to add ${
            Object.keys(err.componentObject[key]).length
          } components with the same id ${chalk.bold(key)} : ${err.componentObject[key]}\n`;
        })
        .join(' ')
  ],

  [
    IdExportedAlready,
    err => `error - the component ${chalk.bold(err.id)} has been already exported to ${chalk.bold(err.remote)}`
  ],
  [
    invalidIdOnCommit,
    err => `error - Unable to tag. ${chalk.bold(err.id)} not found.
Run \`bit status\` command to list all components available for tag.`
  ],
  [NothingToCompareTo, err => 'error - nothing to compare no previous versions found'],
  [PromptCanceled, err => chalk.yellow('operation was aborted')],
  [AuthenticationFailed, err => 'authentication failed']
];

function formatUnhandled(err: Error): string {
  return chalk.red(err.message || err);
}

export default (err: Error): ?string => {
  const error = errorsMap.find(([ErrorType]) => {
    return err instanceof ErrorType;
  });

  if (!error) return formatUnhandled(err);
  const [, func] = error;
  logger.error(`User gets the following error: ${func(err)}`);
  return chalk.red(func(err));
};
