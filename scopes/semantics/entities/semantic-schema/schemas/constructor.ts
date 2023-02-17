import { Location } from '../schema-node';
import { ParameterSchema } from './parameter';
import { FunctionLikeSchema, Modifier } from './function-like';
import { DocSchema } from './docs';
import { ThisTypeSchema } from './this-type';

export class ConstructorSchema extends FunctionLikeSchema {
  constructor(
    location: Location,
    params: ParameterSchema[],
    returns: ThisTypeSchema,
    signature: string,
    modifiers: Modifier[] = [],
    doc?: DocSchema
  ) {
    super(location, 'constructor', params, returns, signature, modifiers, doc, undefined);
  }
}
