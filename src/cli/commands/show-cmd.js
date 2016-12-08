/** @flow */
import Command from '../command';
import { getBit } from '../../api';

const chalk = require('chalk');

export default class Show extends Command {
  name = 'show <name>';
  description = 'show a bit';
  alias = '';
  opts = [];
  
  action([name, ]: [string]): Promise<*> {
    return getBit({ name })
    .then(bit => ({
      name: bit.name,
      version: bit.bitJson.version,
      env: bit.bitJson.env,
      dependencies: bit.bitJson.dependencies,
      path: bit.getPath()
    }));
  }

  report({ name, version, env, dependencies, path }: any): string {
    return `
    ${chalk.blue(name)}
    
      version -> ${version}
      env -> ${env}
      dependencies -> ${Object.keys(dependencies).join(', ')}
      path -> ${path}
    `;
  }
}
