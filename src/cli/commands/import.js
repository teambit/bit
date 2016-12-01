/** @flow */
import { loadBox } from '../../box';
import Command from '../command';

const chalk = require('chalk');

export default class Import extends Command {
  name = 'import <name> [remote]';
  description = 'import a bit';
  alias = 'i';
  opts = [];

  action([name]: [string]): Promise<any> {
    return new Promise((resolve) => {
      const box = loadBox();

      return resolve({
      });
    });
  }

  report({ name }: any): string {
    return chalk.green(`exported bit "${name}" from inline to external`);
  }

}
