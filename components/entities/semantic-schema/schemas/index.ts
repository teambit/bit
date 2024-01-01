/**
 * Ensure that any new Schema class ends with the word 'Schema'
 * This will make sure that the Class Name is not minimized during prod bundling process
 * and the schemaObjToClass can match and instantiate the Schema Class correctly
 */
export { ModuleSchema } from './module';
export { FunctionLikeSchema } from './function-like';
export { TypeRefSchema } from './type-ref';
export { VariableLikeSchema } from './variable-like';
export { ClassSchema } from './class';
export { ConstructorSchema } from './constructor';
export { TypeSchema } from './type';
export { TypeIntersectionSchema } from './type-intersection';
export { TypeUnionSchema } from './type-union';
export { TypeLiteralSchema } from './type-literal';
export { IndexSignatureSchema } from './index-signature';
export { InterfaceSchema } from './interface';
export { GetAccessorSchema } from './get-accessor';
export { SetAccessorSchema } from './set-accessor';
export { TypeQuerySchema } from './type-query';
export { InferenceTypeSchema } from './inference-type';
export { LiteralTypeSchema } from './literal-type';
export { KeywordTypeSchema } from './keyword-type';
export { TypeArraySchema } from './type-array';
export { TypeOperatorSchema } from './type-operator';
export { TupleTypeSchema } from './tuple-type';
export { ParameterSchema } from './parameter';
export { EnumSchema } from './enum';
export { EnumMemberSchema } from './enum-member';
export { ParenthesizedTypeSchema } from './parenthesized-type';
export { TypePredicateSchema } from './type-predicate';
export { IndexedAccessSchema } from './indexed-access-type';
export { TemplateLiteralTypeSchema } from './template-literal-type';
export { TemplateLiteralTypeSpanSchema } from './template-literal-type-span';
export { ThisTypeSchema } from './this-type';
export { UnknownSchema } from './unknown-schema';
export { UnresolvedSchema } from './unresolved-schema';
export { ConditionalTypeSchema } from './conditional-type';
export { ExpressionWithTypeArgumentsSchema } from './expression-with-arguments';
export { NamedTupleSchema } from './named-tuple';
export { UnImplementedSchema } from './unimplemented-schema';
export * from './docs';
