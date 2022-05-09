import chalk from 'chalk';
import { SchemaNode } from '../schema-node';
import { Parameter } from './function';

export class ConstructorSchema implements SchemaNode {
  constructor(readonly args: Parameter[]) {}

  toString() {
    const argsStr = this.args.map((arg) => `${arg.name}: ${arg.type.toString()}`).join(', ');
    return `${chalk.bold('constructor')}(${argsStr})`;
  }

  toObject() {
    return {
      constructorName: this.constructor.name,
      args: this.args,
    };
  }
}
