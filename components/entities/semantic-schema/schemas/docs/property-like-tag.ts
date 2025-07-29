import { SchemaLocation, SchemaNode } from '../../schema-node';
import { SchemaRegistry } from '../../schema-registry';
import { TagName, TagSchema } from './tag';

/**
 * e.g. `@param myParam {string} some comment`
 */
export class PropertyLikeTagSchema extends TagSchema {
  readonly type?: SchemaNode;
  constructor(
    readonly location: SchemaLocation,
    readonly name: string,
    readonly comment?: string,
    type?: SchemaNode
  ) {
    super(location, TagName.parameter, comment);
    this.type = type;
  }

  toString() {
    const comment = this.comment ? ` ${this.comment}` : '';
    const type = this.type ? ` {${this.type.toString()}} ` : '';
    return `@${this.tagName} ${this.name}${type} ${comment}`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    const typeStr = this.type ? ` {${this.type.toFullSignature(options)}} ` : '';
    const comment = this.comment ? ` ${this.comment}` : '';
    return `@${this.tagName} ${this.name}${typeStr}${comment}`;
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      type: this.type?.toObject(),
    };
  }

  static fromObject(obj: Record<string, any>): PropertyLikeTagSchema {
    const location = obj.location;
    const name = obj.name;
    const comment = obj.comment;
    const type = obj.type ? SchemaRegistry.fromObject(obj.type) : undefined;
    return new PropertyLikeTagSchema(location, name, comment, type);
  }
}
