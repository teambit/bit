/** @flow */
import glob from 'glob';
import path from 'path';
import R from 'ramda';
import fs from 'fs-extra';
import { TRANSPILERS_DIR } from '../../constants';
import Command from '../command';

const chalk = require('chalk');

export default class Create extends Command {
  name = 'install <name>';
  description = 'install a transpiler or tester';
  alias = '';
  opts = [];

  action([name, ]: [string], opts: {[string]: boolean}): Promise<*> {
    return new Promise((resolve, reject) => {
      const tranpilersGlobingPattern = path.join(__dirname, '../../..', 'transpilers', '*');
      const pluginsList = glob.sync(tranpilersGlobingPattern);
      const pluginsMap = R.mergeAll(
        pluginsList.map(modulePath => ({ [path.basename(modulePath)]: modulePath }))
      );
      
      if (!pluginsMap[name]) {
        return reject(new Error(`there is no plugin by the name of ${name}`));
      }
      
      const directoryToExtract = path.join(TRANSPILERS_DIR, name);
      fs.ensureDirSync(directoryToExtract);
      return fs.copy(pluginsMap[name], directoryToExtract, (err) => {
        if (err) return reject(err);
        return resolve({ name, directoryToExtract });
      });
    });
  }

  report({ name, directoryToExtract }: any): string {
    return chalk.green(`installed "${name}" in ${directoryToExtract}`);
  }
}
