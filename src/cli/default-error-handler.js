// all errors that the command does not handle comes to this switch statement
// if you handle the error, then return true
import BoxNotFound from '../box/exceptions/box-not-found';
import BitNotFound from '../bit/exceptions/bit-not-found';
import BitAlreadyExist from '../bit/exceptions/bit-already-exist';

const chalk = require('chalk');

export default (err: Error): boolean => {
  if (err instanceof BoxNotFound) {
    return chalk.red('box not found. to create a new box, please use `bit init`');
  }

  if (err instanceof BitNotFound) {
    return chalk.red('bit not found. to create a new bit, please use `bit create {bitName}`');
  }

  if (err instanceof BitAlreadyExist) {
    return chalk.red(`bit ${err.bitName} already exists!`);
  } 

  return null;
};
