import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

export class ParameterSchema extends SchemaNode {
  readonly type: SchemaNode;
  readonly objectBindingNodes?: SchemaNode[];

  constructor(
    readonly location: SchemaLocation,
    readonly name: string,
    type: SchemaNode,
    readonly isOptional: boolean,
    readonly defaultValue?: any,
    readonly description?: string,
    objectBindingNodes?: SchemaNode[]
  ) {
    super();
    this.type = type;
    this.objectBindingNodes = objectBindingNodes;
  }

  toString() {
    return `${this.name}${this.isOptional ? '?' : ''}: ${this.type.toString()}`;
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      type: this.type.toObject(),
      isOptional: this.isOptional,
      defaultValue: this.defaultValue,
      description: this.description,
      objectBindingNodes: this.objectBindingNodes?.map((node) => node.toObject()),
    };
  }

  static fromObject(obj: Record<string, any>): ParameterSchema {
    const location = obj.location;
    const name = obj.name;
    const type = SchemaRegistry.fromObject(obj.type);
    const isOptional = obj.isOptional;
    const defaultValue = obj.defaultValue;
    const description = obj.description;
    const objectBindingNodes = obj.objectBindingNodes?.map((node: any) => SchemaRegistry.fromObject(node));
    return new ParameterSchema(location, name, type, isOptional, defaultValue, description, objectBindingNodes);
  }
}
