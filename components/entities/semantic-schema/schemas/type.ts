import chalk from 'chalk';
import { SchemaLocation, SchemaNode } from '../schema-node';
import { DocSchema } from './docs';
import { SchemaRegistry } from '../schema-registry';

export class TypeSchema extends SchemaNode {
  readonly type: SchemaNode;
  readonly doc?: DocSchema;

  constructor(
    readonly location: SchemaLocation,
    readonly name: string,
    type: SchemaNode,
    readonly signature: string,
    doc?: DocSchema
  ) {
    super();
    this.type = type;
    this.doc = doc;
  }

  toString() {
    return `${chalk.bold(this.name)}: ${this.type.toString()}`;
  }

  getNodes() {
    return [this.type];
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      type: this.type.toObject(),
      signature: this.signature,
    };
  }

  static fromObject(obj: Record<string, any>): TypeSchema {
    const location = obj.location;
    const name = obj.name;
    const type = SchemaRegistry.fromObject(obj.type);
    const signature = obj.signature;
    const doc = obj.doc ? DocSchema.fromObject(obj.doc) : undefined;
    return new TypeSchema(location, name, type, signature, doc);
  }
}
