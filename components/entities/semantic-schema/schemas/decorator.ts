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
    const argsStr = this.args?.map((arg) => arg.toString()).join(', ');
    return `@${this.name}${argsStr ? `(${argsStr})` : ''}`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    let result = '';

    if (options?.showDocs && this.doc) {
      result += `${this.doc.toFullSignature()}\n`;
    }

    const argsStr = this.args?.map((arg) => arg.toFullSignature(options)).join(', ');

    result += `@${this.name}${argsStr ? `(${argsStr})` : ''}`;

    return result;
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
