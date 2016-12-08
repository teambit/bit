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
      transpiler: bit.bitJson.transpiler,
      tester: bit.bitJson.tester,
      dependencies: bit.bitJson.dependencies,
      path: bit.getPath()
    }));
  }

  report({ name, version, transpiler, dependencies, path, tester }: any): string {
    return `
    ${chalk.blue(name)}
    
      version -> ${version}
      transpiler -> ${transpiler}
      tester -> ${tester}
      dependencies -> ${Object.keys(dependencies).join(', ')}
      path -> ${path}
    `;
  }
}
