import { SchemaNode } from '../schema-node';
import { Argument } from './function';

export class ConstructorSchema implements SchemaNode {
  constructor(readonly args: Argument[]) {}

  toObject(): Record<string, any> {
    return {
      args: this.args,
    };
  }
}
