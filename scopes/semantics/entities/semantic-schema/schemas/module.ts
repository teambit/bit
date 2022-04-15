import { Export } from './export';
import { SchemaNode } from '../schema-node';

export class Module implements SchemaNode {
  constructor(
    /**
     * todoL should be an array of schema-nodes
     */
    readonly exports: Export[]
  ) {}

  toObject(): Record<string, any> {
    return this.exports.map((exp) => exp.toObject());
  }

  // toString() {

  // }
}
