import { Transform } from 'class-transformer';
import chalk from 'chalk';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjToInstance } from '../class-transformers';

export class GetAccessorSchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  readonly type: SchemaNode;
  constructor(readonly location: Location, readonly name: string, type: SchemaNode, readonly signature: string) {
    super();
    this.type = type;
  }
  getSignature() {
    return this.signature;
  }

  toString() {
    return `get ${chalk.bold(this.name)}(): ${this.type.toString()}`;
  }
}
