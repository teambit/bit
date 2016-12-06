/** @flow */
import Command from '../command';
import { show } from '../../api';

const chalk = require('chalk');

export default class Remove extends Command {
  name = 'show <name>';
  description = 'show a bit';
  alias = '';
  opts = [];
  
  action([name, ]: [string]): Promise<*> {
    return show({ name })
    .then(bit => ({
      name: bit.name,
      sig: bit.sig,
      version: bit.bitJson.version,
      env: bit.bitJson.env,
      dependencies: bit.bitJson.dependencies,
      path: bit.getPath()
    }));
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
