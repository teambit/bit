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
} from '../consumer/exceptions';
import PluginNotFound from '../consumer/component/exceptions/plugin-not-found';
import ComponentNotFound from '../scope/exceptions/component-not-found';
import PermissionDenied from '../scope/network/exceptions/permission-denied';
import NetworkError from '../scope/network/exceptions/network-error';
import UnexpectedNetworkError from '../scope/network/exceptions/unexpected-network-error';
import MissingImpl from '../consumer/component/exceptions/missing-impl';
import MergeConflict from '../scope/exceptions/merge-conflict';
import RemoteNotFound from '../remotes/exceptions/remote-not-found';
import { ScopeNotFound, ResolutionException } from '../scope/exceptions';
import { ProtocolNotSupported, RemoteScopeNotFound } from '../scope/network/exceptions';
import InvalidBitJson from '../consumer/bit-json/exceptions/invalid-bit-json';

const errorsMap: [[Error, (err: Error) => string]] = [ 
  [ ConsumerAlreadyExists, () => 'there\'s already a scope' ],
  [ ConsumerNotFound, () => 'fatal: scope not found. to create a new scope, please use `bit init`' ],
  [ BitAlreadyExistExternaly, err => `fatal: component "${err.bitName}" already exists in the external library try "bit modify ${err.bitName}" to modify the current component or "bit create -f ${err.bitName}"!`],
  [ PluginNotFound, err => `fatal: The compiler "${err.plugin}" is not installed, please use "bit install ${err.plugin}" to install it.`],
  [ MissingImpl, err => `fatal: The impl file in path "${err.implPath}" does not exist, please check the bit.json or implementation file`],
  [ ProtocolNotSupported, () => 'fatal: remote scope protocol is not suppoerted, please use: `ssh://`, `file://` or `bit://`'],
  [ RemoteScopeNotFound, () => 'fatal: remote scope not found. to create a new scope, please use `bit init --bare` in the remote destination'],
  [ InvalidBitId, () => 'fatal: component ID is invalid, please use the following format: <scope>/[box]/<name>'],
  [ ComponentNotFound, err => `fatal: component with id "${chalk.bold(err.id)}" was not found`],
  [ PermissionDenied, () => 'fatal: permission to scope was denied'],
  [ RemoteNotFound, err => `fatal: remote "${chalk.bold(err.name)}" was not found`],
  [ NetworkError, err => `fatal: remote failed with error: "${chalk.bold(err.remoteErr)}"`],
  [ MergeConflict, () => 'fatal: merge conflict'],
  [ UnexpectedNetworkError, () => 'fatal: unexpected network error has occurred'],
  [ ScopeNotFound, () => 'fatal: scope not found. to create a new scope, please use `bit init --bare`'],
  [ ComponentSpecsFailed, () => 'component\'s specs does not pass, fix them and commit'],
  [ NothingToImport, () => 'there is nothing to import'],
  [ InvalidIdChunk, err => `invalid id part in "${chalk.bold(err.id)}", id part can have only alphanumeric, lowercase charecters, and the following ["-", "_", "$", "!", "."]`],
  [ InvalidBitJson, err => `Error - ${chalk.bold(err.path)} is not a valid JSON file.`],
  [ ResolutionException, e => e.message]
];

export default (err: Error): ?string => {
  const error = errorsMap.find(([ErrorType, ]) => { 
    return err instanceof ErrorType;
  });
  if (!error) return null;
  const [, func] = error;
  return chalk.red(func(err));
};
