/** @flow */
import glob from 'glob';
import path from 'path';
import R from 'ramda';
import fs from 'fs-extra';
import { COMPILERS_DIR } from '../../constants';
import Command from '../command';

const chalk = require('chalk');

export default class Create extends Command {
  name = 'uninstall <name>';
  description = 'uninstall a compiler or tester';
  alias = '';
  opts = [];

  action([name, ]: [string], opts: {[string]: boolean}): Promise<*> {
    return new Promise((resolve, reject) => {
      const installedTranpilersGlobingPattern = path.join(COMPILERS_DIR, '*');
      const installedPluginsList = glob.sync(installedTranpilersGlobingPattern);
      const installedPluginsMap = R.mergeAll(
        installedPluginsList.map(modulePath => ({ [path.basename(modulePath)]: modulePath }))
      );
      
      if (!installedPluginsMap[name]) {
        return reject(new Error(`there is no plugin by the name of ${name} installed`));
      }
      
      const directoryToRemove = path.join(COMPILERS_DIR, name);
      return fs.remove(directoryToRemove, (err) => {
        if (err) return reject(err);
        return resolve({ name, directoryToRemove });
      });
    });
  }

  report({ name, directoryToRemove }: any): string {
    return chalk.green(`uninstalled "${name}" from ${directoryToRemove}`);
  }
}
