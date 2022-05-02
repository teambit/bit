import { SchemaNode } from '../schema-node';
import { Export } from '../schemas';

export class Module implements SchemaNode {
  namespace?: string;
  constructor(readonly exports: SchemaNode[]) {}

  getExportSchemas(): Export[] {
    return this.exports.filter((e) => e instanceof Export) as Export[];
  }

  toObject(): Record<string, any> {
    return this.exports.map((exp) => exp.toObject());
  }
}
