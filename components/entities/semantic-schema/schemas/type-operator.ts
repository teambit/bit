import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

export class TypeOperatorSchema extends SchemaNode {
  type: SchemaNode;
  constructor(readonly location: SchemaLocation, readonly name: string, type: SchemaNode) {
    super();
    this.type = type;
  }

  getNodes() {
    return [this.type];
  }

  toString(options?: { color?: boolean }) {
    return `${this.name} ${this.type.toString(options)}`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    return `${this.name} ${this.type.toFullSignature(options)}`;
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      type: this.type.toObject(),
    };
  }

  static fromObject(obj: Record<string, any>): TypeOperatorSchema {
    const location = obj.location;
    const name = obj.name;
    const type = SchemaRegistry.fromObject(obj.type);
    return new TypeOperatorSchema(location, name, type);
  }
}
