/**
 * an interface for implementing a new schema node.
 */
export interface SchemaNode {
  getSignature?(): string;

  toString(): string;

  toObject(): Record<string, any> & { constructorName: string };
}
