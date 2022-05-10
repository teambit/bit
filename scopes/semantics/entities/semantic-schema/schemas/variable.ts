import chalk from 'chalk';
import { SchemaNode } from '../schema-node';
import { TypeRefSchema } from './type-ref';

export class VariableSchema implements SchemaNode {
  constructor(readonly name: string, private signature: string, private type: TypeRefSchema) {}
  getSignature() {
    return this.signature;
  }

  toObject() {
    return {
      constructorName: this.constructor.name,
      name: this.name,
      signature: this.signature,
      type: this.type.toObject(),
    };
  }

  toString() {
    return `${chalk.bold(this.name)}: ${this.type.toString()}`;
  }
}
