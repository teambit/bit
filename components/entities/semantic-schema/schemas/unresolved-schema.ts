import { SchemaLocation, SchemaNode } from '../schema-node';

/**
 * needed for cases when the exported entity could not be resolved.
 * e.g. exporting mdx variables in the main index.ts file.
 */
export class UnresolvedSchema extends SchemaNode {
  constructor(
    readonly location: SchemaLocation,
    readonly name: string
  ) {
    super();
  }

  toString() {
    return this.name;
  }

  toFullSignature(): string {
    return this.toString();
  }

  toObject() {
    return super.toObject();
  }

  static fromObject(obj: Record<string, any>): UnresolvedSchema {
    const location = obj.location;
    const name = obj.name;
    return new UnresolvedSchema(location, name);
  }
}
