import { Export } from './schemas';
import { SchemaNode } from './schema-node';

export type PlainSemanticSchema = {
  exports?: Export[];
};

export class APISchema implements SchemaNode {
  constructor(readonly exports: Export[] = []) {}

  toString() {
    return JSON.stringify(
      this.exports.map((exp) => exp.toObject()),
      undefined,
      2
    );
  }

  toObject() {
    return {
      exports: this.exports.map((exp) => exp.toObject()),
      filename: '',
    };
  }

  static fromSchema() {}

  static from(plainSchema: PlainSemanticSchema) {
    return new APISchema(plainSchema.exports);
  }
}
