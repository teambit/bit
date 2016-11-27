/** @flow */
import { loadRepository } from '../../repository';
import Bit from '../../bit';

const chalk = require('chalk');

export default class Remove {
  name = 'show <name>';
  description = 'show a bit';
  alias = '';
  opts = [];
  
  action([name, ]: [string]): Promise<any> {
    return new Promise((resolve, reject) => {
      const repo = loadRepository();
      if (!repo) return reject('could not find repo.');
      const bit = Bit.load(name, repo);
      if (!bit) return console.log(chalk.red(`could not find bit ${name}`));
      resolve(bit);
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
