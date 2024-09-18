import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

export class ParameterSchema<T extends SchemaNode = SchemaNode> extends SchemaNode {
  readonly type: T;
  readonly objectBindingNodes?: SchemaNode[];

  constructor(
    readonly location: SchemaLocation,
    readonly name: string,
    type: T,
    readonly isOptional: boolean,
    readonly defaultValue?: any,
    readonly description?: string,
    objectBindingNodes?: SchemaNode[],
    readonly isSpread: boolean = false
  ) {
    super();
    this.type = type;
    this.objectBindingNodes = objectBindingNodes;
    this.isSpread = isSpread;
  }

  toString() {
    return `${this.name}${this.isOptional ? '?' : ''}: ${this.type.toString()}`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    let paramStr = '';

    if (options?.showDocs && this.description) {
      paramStr += `/** ${this.description} */\n`;
    }

    if (this.isSpread) {
      paramStr += '...';
    }

    paramStr += this.name;

    if (this.isOptional) {
      paramStr += '?';
    }

    paramStr += `: ${this.type.toFullSignature(options)}`;

    if (this.defaultValue !== undefined) {
      paramStr += ` = ${this.defaultValue}`;
    }

    if (this.objectBindingNodes && this.objectBindingNodes.length > 0) {
      const bindingsStr = this.objectBindingNodes.map((node) => node.toFullSignature(options)).join(', ');
      paramStr += ` { ${bindingsStr} }`;
    }

    return paramStr;
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
      isSpread: this.isSpread,
    };
  }

  static fromObject<T extends SchemaNode = SchemaNode>(obj: Record<string, any>): ParameterSchema<T> {
    const location = obj.location;
    const name = obj.name;
    const type = SchemaRegistry.fromObject(obj.type);
    const isOptional = obj.isOptional;
    const defaultValue = obj.defaultValue;
    const description = obj.description;
    const isSpread = obj.isSpread;
    const objectBindingNodes = obj.objectBindingNodes?.map((node: any) => SchemaRegistry.fromObject(node));
    return new ParameterSchema(
      location,
      name,
      type,
      isOptional,
      defaultValue,
      description,
      objectBindingNodes,
      isSpread
    );
  }
}
