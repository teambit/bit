import { SchemaLocation, SchemaNode } from '../../schema-node';
import { TagName, TagSchema } from './tag';

export class DocSchema extends SchemaNode {
  readonly tags?: TagSchema[];

  constructor(readonly location: SchemaLocation, readonly raw: string, readonly comment?: string, tags?: TagSchema[]) {
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

  toObject() {
    return {
      name: this.name,
      location: this.location,
      signature: this.signature,
      __schema: this.__schema,
      raw: this.raw,
      comment: this.comment,
      tags: this.tags ? this.tags.map((tag) => tag.toObject()) : undefined,
      doc: undefined,
    };
  }

  static fromObject(obj: Record<string, any>): DocSchema {
    const location = obj.location;
    const tags = obj.tags ? obj.tags.map((tag: any) => TagSchema.fromObject(tag)) : undefined;
    return new DocSchema(location, obj.raw, obj.comment, tags);
  }
}
