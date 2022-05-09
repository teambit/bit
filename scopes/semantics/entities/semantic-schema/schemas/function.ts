import chalk from 'chalk';
import { SchemaNode } from '../schema-node';
import { TypeRefSchema } from './type-ref';

export type Parameter = {
  name: string;
  type: TypeRefSchema;
  defaultValue?: any;
  description?: string;
};

export class FunctionSchema implements SchemaNode {
  constructor(
    readonly name: string,
    // readonly doc: any,
    readonly args: Parameter[],

    readonly returnType: TypeRefSchema,
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
      args: this.args,
      returnType: this.returnType.toObject(),
      signature: this.signature,
    };
  }

  toString() {
    const argsStr = this.args.map((arg) => `${arg.name}: ${arg.type.toString()}`).join(', ');
    return `${chalk.bold(this.name)}(${argsStr}): ${this.returnType.toString()}`;
  }
}
