/**
 * an interface for implementing a new schema node.
 */
export interface SchemaNode {
  readonly location?: Location;
  getSignature?(): string;

  toString(): string;

  toObject(): Record<string, any> & { constructorName: string };
}

export type Location = { file: string; line: number; character: number };
