/**
 * a convenient abstract class for all schema to extend.
 * the reason for having it as an abstract class and not an interface, for now, is mostly for the `__schema` prop.
 * this way it won't need to be implemented in each one of the subclasses.
 */
export abstract class SchemaNode {
  readonly __schema = this.constructor.name;
  abstract readonly location: SchemaLocation;
  readonly doc?: SchemaNode;
  readonly signature?: string;
  readonly name?: string;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static fromObject(obj: Record<string, any>): SchemaNode {
    throw new Error(`Method 'fromObject' not implemented in subclass.`);
  }

  toObject() {
    return {
      __schema: this.__schema,
      location: this.location,
      doc: this.doc ? this.doc.toObject() : undefined,
      signature: this.signature,
      name: this.name,
    };
  }

  abstract toString(): string;
}

export type SchemaLocation = {
  /**
   * file-path relative to the component root-dir. normalized to Linux.
   */
  filePath: string;
  line: number;
  character: number;
};
