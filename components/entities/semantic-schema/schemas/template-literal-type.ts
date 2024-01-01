import { SchemaLocation, SchemaNode } from '../schema-node';
import { TemplateLiteralTypeSpanSchema } from './template-literal-type-span';

export class TemplateLiteralTypeSchema extends SchemaNode {
  readonly templateSpans: TemplateLiteralTypeSpanSchema[];

  constructor(
    readonly location: SchemaLocation,
    readonly head: string,
    templateSpans: TemplateLiteralTypeSpanSchema[]
  ) {
    super();
    this.templateSpans = templateSpans;
  }

  toString() {
    const spans = this.templateSpans.map((span) => span.toString()).join('');
    return `${this.head}${spans}`;
  }

  toObject() {
    return {
      ...super.toObject(),
      head: this.head,
      templateSpans: this.templateSpans.map((span) => span.toObject()),
    };
  }

  static fromObject(obj: Record<string, any>): TemplateLiteralTypeSchema {
    const location = obj.location;
    const head = obj.head;
    const templateSpans = obj.templateSpans.map((span: any) => TemplateLiteralTypeSpanSchema.fromObject(span));
    return new TemplateLiteralTypeSchema(location, head, templateSpans);
  }
}
