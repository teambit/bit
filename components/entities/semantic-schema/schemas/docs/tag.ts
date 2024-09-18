import { SchemaLocation, SchemaNode } from '../../schema-node';

/**
 * e.g. `@deprecated please use something else`
 */
export class TagSchema extends SchemaNode {
  constructor(readonly location: SchemaLocation, readonly tagName: TagName | string, readonly comment?: string) {
    super();
  }

  toString() {
    const comment = this.comment ? ` ${this.comment}` : '';
    return `@${this.tagName}${comment}`;
  }

  toFullSignature(): string {
    return this.toString();
  }

  static fromObject(obj: Record<string, any>): TagSchema {
    const location = obj.location;
    const tagName = obj.tagName;
    const comment = obj.comment;
    return new TagSchema(location, tagName, comment);
  }

  toObject() {
    return {
      __schema: this.__schema,
      location: this.location,
      name: this.name,
      signature: this.signature,
      tagName: this.tagName,
      comment: this.comment,
    };
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
  exports = 'exports',
  link = 'link',
}
