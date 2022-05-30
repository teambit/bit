import { Location, SchemaNode } from '../../schema-node';

/**
 * e.g. `@deprecated please use something else`
 */
export class TagSchema extends SchemaNode {
  constructor(readonly location: Location, readonly tagName: TagName | string, readonly comment?: string) {
    super();
  }

  toString() {
    const comment = this.comment ? ` ${this.comment}` : '';
    return `@${this.tagName}${comment}`;
  }
}

export enum TagName {
  augments = 'augments',
  author = 'author',
  class = 'class',
  callback = 'callback',
  public = 'public',
  private = 'private',
  protected = 'protected',
  readonly = 'readonly',
  override = 'override',
  see = 'see',
  enum = 'enum',
  parameter = 'parameter',
  this = 'this',
  type = 'type',
  template = 'template',
  typedef = 'typedef',
  property = 'property',
  implements = 'implements',
  return = 'return',
  deprecated = 'deprecated',
}
