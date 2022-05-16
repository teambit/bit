import chalk from 'chalk';
import { SchemaNode } from '../schema-node';
import { ParameterSchema } from './parameter';

export class ConstructorSchema implements SchemaNode {
  constructor(readonly params: ParameterSchema[]) {}

  toString() {
    const paramsStr = this.params.map((param) => param.toString()).join(', ');
    return `${chalk.bold('constructor')}(${paramsStr})`;
  }

  toObject() {
    return {
      constructorName: this.constructor.name,
      args: this.params.map((arg) => arg.toObject()),
    };
  }
}
