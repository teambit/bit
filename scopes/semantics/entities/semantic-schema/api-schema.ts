import { Export, Module } from './schemas';
import { SchemaNode } from './schema-node';

export type PlainSemanticSchema = {
  exports?: Export[];
};

export class APISchema implements SchemaNode {
  constructor(readonly module: Module) {}

  toString() {
    return JSON.stringify(
      this.module.exports.map((exp) => exp.toObject()),
      undefined,
      2
    );
  }

  toObject() {
    return {
      exports: this.module.exports.map((exp) => exp.toObject()),
      filename: '',
    };
  }

  listSignatures() {
    return this.module.exports.map((exp) => exp.getSignature?.());
  }

  static fromSchema() {}

  // static from(plainSchema: PlainSemanticSchema) {
  //   return new APISchema(plainSchema.exports);
  // }
}
