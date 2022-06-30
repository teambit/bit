import { Transform } from 'class-transformer';
import chalk from 'chalk';
import { Location, SchemaNode } from '../schema-node';
import { ParameterSchema } from './parameter';
import { schemaObjToInstance } from '../class-transformers';

export class SetAccessorSchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  readonly param: ParameterSchema;
  constructor(readonly location: Location, readonly name: string, param: ParameterSchema, readonly signature: string) {
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
