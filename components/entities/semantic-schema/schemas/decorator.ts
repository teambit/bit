import { SchemaLocation, SchemaNode } from '../schema-node';
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

  toString() {
    return `@${this.name}`;
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
    const args = obj.args ? obj.args.map((arg: any) => SchemaNode.fromObject(arg)) : undefined;
    return new DecoratorSchema(location, name, doc, args);
  }
}
