import { Transform } from 'class-transformer';
import { schemaObjArrayToInstances } from '../../class-transformers';
import { Location, SchemaNode } from '../../schema-node';
import { TagName, TagSchema } from './tag';

export class DocSchema extends SchemaNode {
  @Transform(schemaObjArrayToInstances)
  readonly tags?: TagSchema[];
  constructor(readonly location: Location, readonly raw: string, readonly comment?: string, tags?: TagSchema[]) {
    super();
    this.tags = tags;
  }

  toString() {
    const comment = this.comment ? `${this.comment}\n` : '';
    const tags = this.tags ? this.tags.map((tag) => tag.toString()).join('\n') : '';
    return `${comment}${tags}`;
  }

  hasTag(tagName: TagName) {
    return Boolean(this.findTag(tagName));
  }

  findTag(tagName: TagName) {
    return this.tags?.find((tag) => tag.tagName === tagName);
  }
}
