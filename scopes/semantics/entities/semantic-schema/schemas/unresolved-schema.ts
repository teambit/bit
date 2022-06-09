import { Location, SchemaNode } from '../schema-node';

/**
 * needed for cases when the exported entity could not be resolved.
 * e.g. exporting mdx variables in the main index.ts file.
 */
export class UnresolvedSchema extends SchemaNode {
  constructor(readonly location: Location, readonly name: string) {
    super();
  }

  toString() {
    return this.name;
  }
}
