import { Transform } from 'class-transformer';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjToInstance } from '../class-transformers';
import { schemaObjArrayToInstances } from '../class-transformers/schema-obj-to-class';

export class ParameterSchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  readonly type: SchemaNode;
  @Transform(schemaObjArrayToInstances)
  readonly objectBindingNodes?: SchemaNode[];

  constructor(
    readonly location: Location,
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
}
