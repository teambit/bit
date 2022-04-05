import { Export } from './export';
import { SchemaNode } from '../schema-node';

export class Module implements SchemaNode {
  constructor(
    /**
     * all module exports.
     */
    readonly exports: Export[]
  ) {}

  // toString() {
    
  // }
}
