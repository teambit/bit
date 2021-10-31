import { SchemaNode } from '../schema-node';

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

    /**
     * signature string for display
     */
    signatureStr?: string
  ) {}

  toJsonSchema() {}
}
