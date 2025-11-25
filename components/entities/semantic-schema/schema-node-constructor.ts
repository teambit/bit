import type { SchemaNode } from './schema-node';

export interface SchemaNodeConstructor {
  new (...args: any[]): SchemaNode;
  readonly prototype: SchemaNode;
  name: string;
  fromObject(obj: Record<string, any>): SchemaNode;
}
