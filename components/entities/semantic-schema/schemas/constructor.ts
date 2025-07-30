import type { SchemaLocation } from '../schema-node';
import { ParameterSchema } from './parameter';
import type { Modifier } from './function-like';
import { FunctionLikeSchema } from './function-like';
import { DocSchema } from './docs';
import { ThisTypeSchema } from './this-type';

export class ConstructorSchema extends FunctionLikeSchema {
  constructor(
    location: SchemaLocation,
    params: ParameterSchema[],
    returnType: ThisTypeSchema,
    signature: string,
    modifiers: Modifier[] = [],
    doc?: DocSchema
  ) {
    super(location, 'constructor', params, returnType, signature, modifiers, doc, undefined);
  }

  static fromObject(obj: Record<string, any>): ConstructorSchema {
    const location = obj.location;
    const params = obj.params.map((param: any) => ParameterSchema.fromObject(param));
    const returns = ThisTypeSchema.fromObject(obj.returnType);
    const signature = obj.signature;
    const modifiers = obj.modifiers;
    const doc = obj.doc ? DocSchema.fromObject(obj.doc) : undefined;
    return new ConstructorSchema(location, params, returns, signature, modifiers, doc);
  }
}
