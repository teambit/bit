/** @flow */
import { loadBox } from '../../box';
import Command from '../command';

const chalk = require('chalk');

export default class Remove extends Command {
  name = 'show <name>';
  description = 'show a bit';
  alias = '';
  opts = [];
  
  action([name, ]: [string]): Promise<any> {
    return new Promise((resolve, reject) => {
      const box = loadBox();
      if (!box) return reject(new Error('could not find box'));
      return box.get(name)
         .then((bit) => {
           if (!bit) return reject(new Error(`could not find bit ${name}`));
           return resolve(bit);
         });
    });
  }

  report({ name, version, env, dependencies, path, sig }: any): string {
    return `
    ${chalk.blue(sig)}
    
      name -> ${name}
      version -> ${version}
      env -> ${env}
      dependencies -> ${dependencies}
      path -> ${path}
    `;
  }
}
