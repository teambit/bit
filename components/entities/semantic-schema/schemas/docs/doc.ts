import { SchemaLocation, SchemaNode } from '../../schema-node';
import { SchemaRegistry } from '../../schema-registry';
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
      __schema: this.__schema,
      name: this.name,
      location: this.location,
      signature: this.signature,
      raw: this.raw,
      comment: this.comment,
      tags: this.tags ? this.tags.map((tag) => tag.toObject()) : undefined,
    };
  }

  static fromObject(obj: Record<string, any>): DocSchema {
    const location = obj.location;
    const tags = obj.tags ? obj.tags.map((tag: any) => SchemaRegistry.fromObject(tag)) : undefined;
    return new DocSchema(location, obj.raw, obj.comment, tags);
  }
}
