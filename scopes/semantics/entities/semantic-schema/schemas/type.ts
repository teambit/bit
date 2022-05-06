import chalk from 'chalk';
import { SchemaNode } from '../schema-node';

export class TypeSchema implements SchemaNode {
  constructor(private name: string, private type: SchemaNode, private signature: string) {}
  toObject(): Record<string, any> {
    return {
      name: this.name,
      type: this.type.toObject(),
      signature: this.signature,
    };
  }
  toString() {
    return `${chalk.bold(this.name)}: ${this.type.toString()}`;
  }
}
