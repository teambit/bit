import { SchemaNode } from '../schema-node';

export type Argument = {
  name: string;
  defaultValue?: any;
  description: any;
  type: string;
};

export class ConstructorSchema implements SchemaNode {
  constructor(readonly args: Argument[]) {}

  toObject(): Record<string, any> {
    return {
      args: this.args,
    };
  }
}
