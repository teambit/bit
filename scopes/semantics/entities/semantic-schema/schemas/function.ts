import chalk from 'chalk';
import { SchemaNode } from '../schema-node';

export type Parameter = {
  name: string;
  type: SchemaNode;
  defaultValue?: any;
  description?: string;
};

export class FunctionSchema implements SchemaNode {
  constructor(
    readonly name: string,
    // readonly doc: any,
    readonly params: Parameter[],

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
    const paramsStr = this.params.map((arg) => `${arg.name}: ${arg.type.toString()}`).join(', ');
    return `${chalk.bold(this.name)}(${paramsStr}): ${this.returnType.toString()}`;
  }
}
