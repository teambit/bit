// all errors that the command does not handle comes to this switch statement
// if you handle the error, then return true
import ConsumerNotFound from '../consumer/exceptions/consumer-not-found';
import BitNotFound from '../consumer/component/exceptions/bit-not-found';
import InvalidBitId from '../bit-id/exceptions/invalid-bit-id';
import BitAlreadyExistExternaly from '../consumer/component/exceptions/bit-already-exist-externaly';
import PluginNotFound from '../consumer/component/exceptions/plugin-not-found';
import ComponentNotFound from '../scope/exceptions/component-not-found';
import MissingImpl from '../consumer/component/exceptions/missing-impl';
import { ScopeNotFound } from '../scope/exceptions';
import { ProtocolNotSupported, RemoteScopeNotFound } from '../scope/network/exceptions';

const chalk = require('chalk');

const errorsMap: [[Error, (err: Error) => string]] = [ 
  [ ConsumerNotFound, () => 'fatal: scope not found. to create a new scope, please use `bit init`' ],
  [ BitNotFound, () => 'fatal: bit not found. to create a new bit, please use `bit create {bitName}`' ],
  [ BitAlreadyExistExternaly, err => `fatal: bit "${err.bitName}" already exists in the external library try "bit modify ${err.bitName}" to modify the current bit or "bit create -f ${err.bitName}"!`],
  [ PluginNotFound, err => `fatal: The compiler "${err.plugin}" is not installed, please use "bit install ${err.plugin}" to install it.`],
  [ MissingImpl, err => `fatal: The impl file in path "${err.implPath}" does not exist, please check the bit.json or implementation file`],
  [ ProtocolNotSupported, () => 'fatal: remote scope protocol is not suppoerted, please use: `ssh://`, `file://` or `bit://`'],
  [ RemoteScopeNotFound, () => 'fatal: remote scope not found. to create a new scope, please use `bit init --bare` in the remote destination'],
  [ InvalidBitId, () => 'fatal: bit component ID is invalid, please use the following format: <scope>/[box]/<name>'],
  [ ComponentNotFound, err => `fatal: component with id ${chalk.bold(err.id.toString())} was not found`],
  [ ScopeNotFound, () => 'fatal: scope not found. to create a new scope, please use `bit init`']
];

export default (err: Error): ?string => {
  const error = errorsMap.find(([ErrorType, ]) => { 
    return err instanceof ErrorType;
  });
  if (!error) return null;
  const [, func] = error;
  return chalk.red(func(err));
};
