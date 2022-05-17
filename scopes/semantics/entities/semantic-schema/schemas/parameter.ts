import { SchemaNode } from '../schema-node';

export class ParameterSchema implements SchemaNode {
  constructor(
    readonly name: string,
    readonly type: SchemaNode,
    readonly defaultValue?: any,
    readonly description?: string
  ) {}

  toObject() {
    return {
      constructorName: this.constructor.name,
      name: this.name,
      type: this.type.toObject(),
      defaultValue: this.defaultValue,
      description: this.description,
    };
  }
  toString() {
    return `${this.name}: ${this.type.toString()}`;
  }
}
