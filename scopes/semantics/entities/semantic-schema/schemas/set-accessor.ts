import chalk from 'chalk';
import { SchemaNode } from '../schema-node';
import { ParameterSchema } from './parameter';

export class SetAccessorSchema implements SchemaNode {
  constructor(private name: string, private param: ParameterSchema, private signature: string) {}
  getSignature() {
    return this.signature;
  }

  toObject() {
    return {
      constructorName: this.constructor.name,
      name: this.name,
      param: this.param,
      signature: this.signature,
    };
  }

  toString() {
    return `set ${chalk.bold(this.name)}(${this.param.toString()})`;
  }
}
