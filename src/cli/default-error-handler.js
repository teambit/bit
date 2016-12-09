// all errors that the command does not handle comes to this switch statement
// if you handle the error, then return true
import ConsumerNotFound from '../consumer/exceptions/consumer-not-found';
import BitNotFound from '../bit/exceptions/bit-not-found';
import BitAlreadyExistInternaly from '../bit/exceptions/bit-already-exist-internaly';
import BitAlreadyExistExternaly from '../bit/exceptions/bit-already-exist-externaly';

const chalk = require('chalk');

const errorsMap: [[Error, (err: Error) => string]] = [ 
  [ ConsumerNotFound, () => 'box not found. to create a new box, please use `bit init`' ],
  [ BitNotFound, () => 'bit not found. to create a new bit, please use `bit create {bitName}`' ],
  [ BitAlreadyExistInternaly, err => `bit ${err.bitName} already exists!` ],
  [ BitAlreadyExistExternaly, err => `bit ${err.bitName} already exists in the external library try "bit modify ${err.bitName}" to modify the current bit or "bit create -f ${err.bitName}"!`]   
];

export default (err: Error): ?string => {
  const error = errorsMap.find(([ErrorType]) => err instanceof ErrorType);
  if (!error) return null;
  const [, func] = error;
  return chalk.red(func(err));
};
