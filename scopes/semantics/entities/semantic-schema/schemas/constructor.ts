import chalk from 'chalk';
import { SchemaNode } from '../schema-node';
import { Argument } from './function';

export class ConstructorSchema implements SchemaNode {
  constructor(readonly args: Argument[]) {}

  toString() {
    const argsStr = this.args.map((arg) => `${arg.name}: ${arg.type.toString()}`).join(', ');
    return `${chalk.bold('constructor')}(${argsStr})`;
  }

  toObject(): Record<string, any> {
    return {
      args: this.args,
    };
  }
}
