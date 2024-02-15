import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';
import { DocSchema } from './docs';

export class DecoratorSchema extends SchemaNode {
  constructor(
    readonly location: SchemaLocation,
    readonly name: string,
    readonly doc?: DocSchema,
    readonly args?: SchemaNode[]
  ) {
    super();
  }

  getNodes() {
    return this.args || [];
  }

  toString() {
    // name and args
    const argsStr = this.args?.map((arg) => arg.toString()).join(', ');
    return `@${this.name}${argsStr ? `(${argsStr})` : ''}`;
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      doc: this.doc?.toObject(),
      args: this.args?.map((arg) => arg.toObject()),
    };
  }

  static fromObject(obj: Record<string, any>): DecoratorSchema {
    const location = obj.location;
    const name = obj.name;
    const doc = obj.doc ? DocSchema.fromObject(obj.doc) : undefined;
    const args = obj.args ? obj.args.map((arg) => SchemaRegistry.fromObject(arg)) : undefined;
    return new DecoratorSchema(location, name, doc, args);
  }
}
