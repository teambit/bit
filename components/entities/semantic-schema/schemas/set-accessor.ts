import chalk from 'chalk';
import { SchemaLocation, SchemaNode } from '../schema-node';
import { ParameterSchema } from './parameter';

export class SetAccessorSchema extends SchemaNode {
  readonly param: ParameterSchema;

  constructor(
    readonly location: SchemaLocation,
    readonly name: string,
    param: ParameterSchema,
    readonly signature: string
  ) {
    super();
    this.param = param;
  }

  getSignature() {
    return this.signature;
  }

  toString() {
    return `set ${chalk.bold(this.name)}(${this.param.toString()})`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    const paramStr = this.param.toFullSignature(options);
    return `set ${this.name}(${paramStr})`;
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      param: this.param.toObject(),
      signature: this.signature,
    };
  }

  static fromObject(obj: Record<string, any>): SetAccessorSchema {
    const location = obj.location;
    const name = obj.name;
    const param = ParameterSchema.fromObject(obj.param);
    const signature = obj.signature;
    return new SetAccessorSchema(location, name, param, signature);
  }
}
