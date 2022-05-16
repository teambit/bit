import chalk from 'chalk';
import { SchemaNode } from '../schema-node';

export class VariableSchema implements SchemaNode {
  constructor(readonly name: string, private signature: string, private type: SchemaNode) {}
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
