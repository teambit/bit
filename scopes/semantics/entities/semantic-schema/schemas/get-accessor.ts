import chalk from 'chalk';
import { SchemaNode } from '../schema-node';
import { TypeRefSchema } from './type-ref';

export class GetAccessorSchema implements SchemaNode {
  constructor(private name: string, private type: TypeRefSchema, private signature: string) {}
  getSignature() {
    return this.signature;
  }

  toObject() {
    return {
      constructorName: this.constructor.name,
      name: this.name,
      type: this.type.toObject(),
      signature: this.signature,
    };
  }

  toString() {
    return `get ${chalk.bold(this.name)}(): ${this.type.toString()}`;
  }
}
