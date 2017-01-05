// all errors that the command does not handle comes to this switch statement
// if you handle the error, then return true
import ConsumerNotFound from '../consumer/exceptions/consumer-not-found';
import BitNotFound from '../bit/exceptions/bit-not-found';
import BitAlreadyExistExternaly from '../bit/exceptions/bit-already-exist-externaly';
import PluginNotFound from '../bit/exceptions/plugin-not-found';
import MissingImpl from '../bit/exceptions/missing-impl';
import { ScopeNotFound } from '../scope/exceptions';
import { ProtocolNotSupported, RemoteScopeNotFound } from '../network/exceptions';

const chalk = require('chalk');

const errorsMap: [[Error, (err: Error) => string]] = [ 
  [ ConsumerNotFound, () => 'scope not found. to create a new scope, please use `bit init`' ],
  [ BitNotFound, () => 'bit not found. to create a new bit, please use `bit create {bitName}`' ],
  [ BitAlreadyExistExternaly, err => `bit "${err.bitName}" already exists in the external library try "bit modify ${err.bitName}" to modify the current bit or "bit create -f ${err.bitName}"!`],
  [ PluginNotFound, err => `The compiler "${err.plugin}" is not installed, please use "bit install ${err.plugin}" to install it.`],
  [ MissingImpl, err => `The impl file in path "${err.implPath}" does not exist, please check the bit.json or implementation file`],
  [ ProtocolNotSupported, () => 'remote scope protocol is not suppoerted, please use: `ssh://`, `file://` or `bit://`'],
  [ RemoteScopeNotFound, () => 'remote scope not found. to create a new scope, please use `bit init` in the remote destination'],
  [ ScopeNotFound, () => 'scope not found. to create a new scope, please use `bit init`']
];

export default (err: Error): ?string => {
  const error = errorsMap.find(([ErrorType, ]) => { 
    return err instanceof ErrorType;
  });
  if (!error) return null;
  const [, func] = error;
  return chalk.red(func(err));
};
