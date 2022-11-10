import { Transform } from 'class-transformer';
import { schemaObjToInstance } from '../class-transformers';
import { Location, SchemaNode } from '../schema-node';
import { DocSchema } from './docs';

export class EnumMemberSchema extends SchemaNode {
  @Transform(schemaObjToInstance)
  readonly doc?: DocSchema;

  constructor(
    readonly location: Location,
    readonly name: string,
    readonly signature: string,
    readonly value?: string,
    doc?: DocSchema
  ) {
    super();
    this.doc = doc;
  }

  toString() {
    if (!this.value) return this.name;
    return `${this.name}=${this.value}`;
  }
}
