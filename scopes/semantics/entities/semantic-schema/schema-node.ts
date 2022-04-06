/**
 * an interface for implementing a new schema node.
 */
export interface SchemaNode {
  // toString(): string;

  toObject(): Record<string, any>;
}
