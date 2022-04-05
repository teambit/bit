
/**
 * an interface for implmenting a new schema node.
 */
export interface SchemaNode {
  // toString(): string;

  /**
   * TODO: this should be made mandatory. this is the main serialization method.
   */
  toObject(): Record<string, any>;
}
