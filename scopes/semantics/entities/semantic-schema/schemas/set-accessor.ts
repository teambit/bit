import { Transform } from 'class-transformer';
import chalk from 'chalk';
import { SchemaNode } from '../schema-node';
import { ParameterSchema } from './parameter';
import { schemaObjToInstance } from '../schema-obj-to-class';

export class SetAccessorSchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  readonly param: ParameterSchema;
  constructor(readonly name: string, param: ParameterSchema, readonly signature: string) {
    super();
    this.param = param;
  }
  getSignature() {
    return this.signature;
  }

  toString() {
    return `set ${chalk.bold(this.name)}(${this.param.toString()})`;
  }
}
