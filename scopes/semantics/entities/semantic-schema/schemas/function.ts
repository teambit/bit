import { SchemaNode } from '../schema-node';
import { TypeRefSchema } from './type-ref';

export type Argument = {
  name: string;
  defaultValue?: any;
  description: any;
  type: string;
};

export class FunctionSchema implements SchemaNode {
  constructor(
    readonly name: string,
    // readonly doc: any,
    readonly args: Argument[],

    readonly returnType: TypeRefSchema,
    private signature: string
  ) {}

  serialize() {}

  toJsonSchema() {}

  getSignature() {
    return this.signature;
  }

  toObject(): Record<string, any> {
    return {
      name: this.name,
      args: this.args,
      returnType: this.returnType.toObject(),
    };
  }
}
