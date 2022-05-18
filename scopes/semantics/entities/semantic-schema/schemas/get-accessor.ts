import { Transform } from 'class-transformer';
import chalk from 'chalk';
import { SchemaNode } from '../schema-node';
import { schemaObjToInstance } from '../schema-obj-to-class';

export class GetAccessorSchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  readonly type: SchemaNode;
  constructor(readonly name: string, type: SchemaNode, readonly signature: string) {
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
