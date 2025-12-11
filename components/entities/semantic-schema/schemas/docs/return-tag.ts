import type { SchemaLocation, SchemaNode } from '../../schema-node';
import { SchemaRegistry } from '../../schema-registry';
import { TagName, TagSchema } from './tag';

/**
 * e.g. `@return {string} some comment`
 */
export class ReturnTagSchema extends TagSchema {
  readonly type?: SchemaNode;

  constructor(
    readonly location: SchemaLocation,
    readonly comment?: string,
    type?: SchemaNode
  ) {
    super(location, TagName.return, comment);
    this.type = type;
  }

  toString() {
    const comment = this.comment ? ` ${this.comment}` : '';
    return `@${this.tagName}${comment}`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    const typeStr = this.type ? ` {${this.type.toFullSignature(options)}}` : '';
    const comment = this.comment ? ` ${this.comment}` : '';
    return `@${this.tagName}${typeStr}${comment}`;
  }

  toObject() {
    return {
      ...super.toObject(),
      type: this.type?.toObject(),
    };
  }

  static fromObject(obj: Record<string, any>): ReturnTagSchema {
    const location = obj.location;
    const comment = obj.comment;
    const type = obj.type ? SchemaRegistry.fromObject(obj.type) : undefined;
    return new ReturnTagSchema(location, comment, type);
  }
}
