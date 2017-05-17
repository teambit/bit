// all errors that the command does not handle comes to this switch statement
// if you handle the error, then return true
import chalk from 'chalk';
import { LOCAL_SCOPE_NOTATION } from '../constants';
import { InvalidBitId, InvalidIdChunk } from '../bit-id/exceptions';
import BitAlreadyExistExternaly from '../consumer/component/exceptions/bit-already-exist-externaly';
import {
  ConsumerAlreadyExists,
  NothingToImport,
  ConsumerNotFound,
  ComponentSpecsFailed,
} from '../consumer/exceptions';
import { DriverNotFound } from '../driver';
import ComponentNotFoundInline from '../consumer/component/exceptions/component-not-found-inline';
import PluginNotFound from '../consumer/component/exceptions/plugin-not-found';
import PermissionDenied from '../scope/network/exceptions/permission-denied';
import NetworkError from '../scope/network/exceptions/network-error';
import UnexpectedNetworkError from '../scope/network/exceptions/unexpected-network-error';
import MissingImpl from '../consumer/component/exceptions/missing-impl';
import MergeConflict from '../scope/exceptions/merge-conflict';
import RemoteNotFound from '../remotes/exceptions/remote-not-found';
import { ScopeNotFound, ResolutionException, ComponentNotFound, DependencyNotFound } from '../scope/exceptions';
import { ProtocolNotSupported, RemoteScopeNotFound } from '../scope/network/exceptions';
import InvalidBitJson from '../consumer/bit-json/exceptions/invalid-bit-json';
import ExportWithoutThis from '../api/consumer/lib/exceptions/export-without-this';
import invalidIdOnCommit from '../api/consumer/lib/exceptions/invalid-id-on-commit';
import MiscSourceNotFound from '../consumer/component/exceptions/misc-source-not-found';

const errorsMap: [[Error, (err: Error) => string]] = [
  [ ConsumerAlreadyExists, () => 'there\'s already a scope' ],
  [ ConsumerNotFound, () => 'fatal: scope not found. to create a new scope, please use `bit init`' ],
  [ BitAlreadyExistExternaly, err => `fatal: component "${err.bitName}" already exists in the external library try "bit modify ${err.bitName}" to modify the current component or "bit create -f ${err.bitName}"!`],
  [ PluginNotFound, err => `fatal: The compiler "${err.plugin}" is not installed, please use "bit install ${err.plugin}" to install it.`],
  [ MissingImpl, err => `fatal: The impl file in path "${err.implPath}" does not exist, please check the bit.json or implementation file`],
  [ MiscSourceNotFound, err => `warning: the file "${err.path}" mentioned in your bit.json inside source.misc was not found!`],
  [ ProtocolNotSupported, () => 'fatal: remote scope protocol is not supported, please use: `ssh://`, `file://` or `bit://`'],
  [ RemoteScopeNotFound, err => `fatal: remote scope "${chalk.bold(err)}" not found.`],
  [ InvalidBitId, () => 'fatal: component ID is invalid, please use the following format: <scope>/[box]/<name>'],
  [ ComponentNotFound, err => `fatal: component with id "${chalk.bold(err.id)}" was not found`],
  [ DependencyNotFound, err => `error: Dependency "${chalk.bold(err.id)}" not found. Please verify bit.json - ${chalk.bold(err.bitJsonPath)}`],
  [ ComponentNotFoundInline, err => `fatal: component in path "${chalk.bold(err.path)}" was not found`],
  [ PermissionDenied, () => 'fatal: permission to scope was denied'],
  [ RemoteNotFound, err => `fatal: remote "${chalk.bold(err.name)}" was not found`],
  [ NetworkError, err => `fatal: remote failed with error: "${chalk.bold(err.remoteErr)}"`],
  [ MergeConflict, () => 'error: Merge conflict occurred when exporting the component.\nTo resolve it, please modify the latest version of the remote component, and only then export your changes.'],
  [ UnexpectedNetworkError, () => 'fatal: unexpected network error has occurred'],
  [ ScopeNotFound, () => 'fatal: scope not found. to create a new scope, please use `bit init --bare`'],
  [ ComponentSpecsFailed, () => 'component\'s specs does not pass, fix them and commit'],
  [ NothingToImport, () => 'there is nothing to import'],
  [ InvalidIdChunk, err => `invalid id part in "${chalk.bold(err.id)}", id part can have only alphanumeric, lowercase characters, and the following ["-", "_", "$", "!", "."]`],
  [ InvalidBitJson, err => `error: ${chalk.bold(err.path)} is not a valid JSON file.`],
  [ ExportWithoutThis, err => `Error: Missing local scope annotation when exporting ${err.id}. Please run 'bit export ${LOCAL_SCOPE_NOTATION}/${err.id} ${err.remote}'`],
  [ ResolutionException, e => e.message],
  [ DriverNotFound, err => `fatal: a client-driver ${chalk.bold(err.driver)} is missing for the language ${chalk.bold(err.lang)} set in your bit.json file.`],
  [ invalidIdOnCommit, err => `error - Unable to commit. ${chalk.bold(err.id)} not found.
Run \`bit status\` command to list all components available for commit.`]
];

export default (err: Error): ?string => {
  const error = errorsMap.find(([ErrorType, ]) => {
    // If the error came from another project (such as bit-scope-client), it's easier to use the
    // "name" attribute, which is by default "Error" but can be overridden in the sub-class.
    // The `ErrorType.name` is a string representation of the Error class name.
    return err instanceof ErrorType || err.name === ErrorType.name;
  });

  if (!error) return null;
  const [, func] = error;
  return chalk.red(func(err));
};
