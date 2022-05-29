import { Transform } from 'class-transformer';
import chalk from 'chalk';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjToInstance } from '../class-transformers';

/**
 * can be also a property or property-signature
 */
export class VariableSchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  type: SchemaNode;
  constructor(readonly location: Location, readonly name: string, readonly signature: string, type: SchemaNode) {
    super();
    this.type = type;
  }

  toString() {
    return `${chalk.bold(this.name)}: ${this.type.toString()}`;
  }
}
