// TODO: this file can be a dedicated component

import type { Location } from '@teambit/semantics.entities.semantic-schema';
import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';

/**
 * Vue SFC schema node.
 */
export class VueSchema extends SchemaNode {
  constructor(
    readonly location: Location,
    readonly name: string,
    readonly meta: any
  ) {
    super();
  }

  getNodes() {
    return [];
  }

  toString() // options?: { color?: boolean }
  : string {
    // const bold = options?.color ? chalk.bold : (x: string) => x;
    // return `${bold(this.name)}: import('vue').Component`
    return `${this.name}: import('vue').Component`;
  }

  toFullSignature(): string {
    return `${this.name}: import('vue').Component`;
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      meta: this.meta,
    };
  }

  static fromObject(obj: Record<string, any>): VueSchema {
    const location = obj.location;
    const name = obj.name;
    const meta = obj.meta;
    return new VueSchema(location, name, meta);
  }
}
