import { Location, SchemaNode } from '../../schema-node';
import { TagName, TagSchema } from './tag';

/**
 * e.g. `@return {string} some comment`
 */
export class ReturnTagSchema extends TagSchema {
  constructor(
    readonly location: Location,
    readonly tagName = TagName.return,
    readonly comment?: string,
    readonly type?: SchemaNode
  ) {
    super(location, tagName, comment);
  }

  toString() {
    const comment = this.comment ? ` ${this.comment}` : '';
    return `@${this.tagName}${comment}`;
  }
}
