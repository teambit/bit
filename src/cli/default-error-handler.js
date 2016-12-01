// all errors that the command does not handle comes to this switch statement
// if you handle the error, then return true
import BoxNotFound from '../box/exceptions/box-not-found';

const chalk = require('chalk');

export default (err: Error): boolean => {
  if (err instanceof BoxNotFound) {
    return chalk.red('box not found. to create a new box, please use `box init`');
  }

  return null;
};
