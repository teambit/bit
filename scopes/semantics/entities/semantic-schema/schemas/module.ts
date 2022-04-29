import { SchemaNode } from '../schema-node';

export class Module implements SchemaNode {
  namespace?: string;
  constructor(readonly exports: SchemaNode[]) {}

  toObject(): Record<string, any> {
    return this.exports.map((exp) => exp.toObject());
  }
}
