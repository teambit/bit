import { Transform } from 'class-transformer';
import { Location, SchemaNode } from '../../schema-node';
import { TagName, TagSchema } from './tag';
import { schemaObjToInstance } from '../../class-transformers';

/**
 * e.g. `@return {string} some comment`
 */
export class ReturnTagSchema extends TagSchema {
  @Transform(schemaObjToInstance)
  readonly type?: SchemaNode;
  constructor(readonly location: Location, readonly comment?: string, type?: SchemaNode) {
    super(location, TagName.return, comment);
    this.type = type;
  }

  toString() {
    const comment = this.comment ? ` ${this.comment}` : '';
    return `@${this.tagName}${comment}`;
  }
}
