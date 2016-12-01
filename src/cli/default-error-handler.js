// all errors that the command does not handle comes to this switch statement
// if you handle the error, then return true
import BoxNotFound from '../box/exceptions/box-not-found';
import BitNotFound from '../bit/exceptions/bit-not-found';
import BitAlreadyExist from '../bit/exceptions/bit-already-exist';

const chalk = require('chalk');

const errorsMap = [ 
  [ BoxNotFound, () => 'box not found. to create a new box, please use `bit init`' ],
  [ BitNotFound, () => 'bit not found. to create a new bit, please use `bit create {bitName}`' ],
  [ BitAlreadyExist, err => `bit ${err.bitName} already exists!` ]   
];

export default (err: Error): ?string => {
  const [, func] = errorsMap.find(([ErrorType]) => err instanceof ErrorType);
  return chalk.red(func(err));
};
