import { Transform } from 'class-transformer';
import { Location, SchemaNode } from '../schema-node';
import { schemaObjArrayToInstances } from '../class-transformers';
import { TemplateLiteralTypeSpanSchema } from './template-literal-type-span';

export class TemplateLiteralTypeSchema extends SchemaNode {
  @Transform(schemaObjArrayToInstances)
  readonly templateSpans: TemplateLiteralTypeSpanSchema[];
  constructor(readonly location: Location, readonly head: string, templateSpans: TemplateLiteralTypeSpanSchema[]) {
    super();
    this.templateSpans = templateSpans;
  }

  toString() {
    const spans = this.templateSpans.map((span) => span.toString()).join('');
    return `${this.head}${spans}`;
  }
}
