import chalk from 'chalk';
import { SchemaNode } from '../schema-node';
import { ParameterSchema } from './parameter';

export class FunctionSchema implements SchemaNode {
  constructor(
    readonly name: string,
    // readonly doc: any,
    readonly params: ParameterSchema[],

    readonly returnType: SchemaNode,
    private signature: string
  ) {}

  serialize() {}

  toJsonSchema() {}

  getSignature() {
    return this.signature;
  }

  toObject() {
    return {
      constructorName: this.constructor.name,
      name: this.name,
      params: this.params,
      returnType: this.returnType.toObject(),
      signature: this.signature,
    };
  }

  toString() {
    const paramsStr = this.params.map((param) => param.toString()).join(', ');
    return `${chalk.bold(this.name)}(${paramsStr}): ${this.returnType.toString()}`;
  }
}
