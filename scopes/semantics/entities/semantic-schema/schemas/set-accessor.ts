import chalk from 'chalk';
import { Parameter } from '.';
import { SchemaNode } from '../schema-node';

export class SetAccessorSchema implements SchemaNode {
  constructor(private name: string, private param: Parameter, private signature: string) {}
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
    return `set ${chalk.bold(this.name)}(${this.param.name}: ${this.param.type})`;
  }
}
