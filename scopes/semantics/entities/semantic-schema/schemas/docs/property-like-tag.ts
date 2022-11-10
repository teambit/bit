import { Transform } from 'class-transformer';
import { Location, SchemaNode } from '../../schema-node';
import { TagName, TagSchema } from './tag';
import { schemaObjToInstance } from '../../class-transformers';

/**
 * e.g. `@param myParam {string} some comment`
 */
export class PropertyLikeTagSchema extends TagSchema {
  @Transform(schemaObjToInstance)
  readonly type?: SchemaNode;
  constructor(readonly location: Location, readonly name: string, readonly comment?: string, type?: SchemaNode) {
    super(location, TagName.parameter, comment);
    this.type = type;
  }

  toString() {
    const comment = this.comment ? ` ${this.comment}` : '';
    const type = this.type ? ` {${this.type.toString()}} ` : '';
    return `@${this.tagName} ${this.name}${type} ${comment}`;
  }
}
