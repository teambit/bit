import { Export } from './schemas';
import { SchemaNode } from './schema-node';

export type PlainSemanticSchema = {
  exports?: Export[];
};

export class SemanticSchema implements SchemaNode {
  constructor(readonly exports: Export[] = []) {}

  toString() {
    return '';
  }

  static fromSchema() {}

  static from(plainSchema: PlainSemanticSchema) {
    return new SemanticSchema(plainSchema.exports);
  }
}
