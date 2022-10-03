import {
  TypeNode,
  SyntaxKind,
  KeywordTypeNode,
  FunctionTypeNode,
  TypeQueryNode,
  TypeReferenceNode,
  ArrayTypeNode,
  TypeOperatorNode,
  TupleTypeNode,
  IntersectionTypeNode,
  UnionTypeNode,
  TypeLiteralNode,
  ParenthesizedTypeNode,
  TypePredicateNode,
  isIdentifier,
  IndexedAccessTypeNode,
  TemplateLiteralTypeNode,
  TemplateLiteralTypeSpan,
  ThisTypeNode,
  ConditionalTypeNode,
} from 'typescript';
import {
  SchemaNode,
  TypeRefSchema,
  TypeIntersectionSchema,
  TypeUnionSchema,
  TypeLiteralSchema,
  TypeQuerySchema,
  LiteralTypeSchema,
  KeywordTypeSchema,
  TypeArraySchema,
  TypeOperatorSchema,
  TupleTypeSchema,
  FunctionLikeSchema,
  ParenthesizedTypeSchema,
  TypePredicateSchema,
  IndexedAccessSchema,
  TemplateLiteralTypeSpanSchema,
  TemplateLiteralTypeSchema,
  ThisTypeSchema,
  Modifier,
  ConditionalTypeSchema,
} from '@teambit/semantics.entities.semantic-schema';
import pMapSeries from 'p-map-series';
import { SchemaExtractorContext } from '../../schema-extractor-context';
import { getParams } from './get-params';
import { typeElementToSchema } from './type-element-to-schema';

// eslint-disable-next-line complexity
export async function typeNodeToSchema(node: TypeNode, context: SchemaExtractorContext): Promise<SchemaNode> {
  const location = context.getLocation(node);
  if (isKeywordType(node)) {
    return new KeywordTypeSchema(location, node.getText());
  }
  switch (node.kind) {
    case SyntaxKind.IntersectionType:
      return intersectionType(node as IntersectionTypeNode, context);
    case SyntaxKind.UnionType:
      return unionType(node as UnionTypeNode, context);
    case SyntaxKind.TypeReference:
      return typeReference(node as TypeReferenceNode, context);
    case SyntaxKind.TypeLiteral:
      return typeLiteral(node as TypeLiteralNode, context);
    case SyntaxKind.LiteralType: // e.g. string/boolean
      return new LiteralTypeSchema(location, node.getText());
    case SyntaxKind.FunctionType:
      return functionType(node as FunctionTypeNode, context);
    case SyntaxKind.TypeQuery:
      return typeQuery(node as TypeQueryNode, context);
    case SyntaxKind.ArrayType:
      return arrayType(node as ArrayTypeNode, context);
    case SyntaxKind.TypeOperator:
      return typeOperator(node as TypeOperatorNode, context);
    case SyntaxKind.TupleType:
      return tupleType(node as TupleTypeNode, context);
    case SyntaxKind.ParenthesizedType:
      return parenthesizedType(node as ParenthesizedTypeNode, context);
    case SyntaxKind.TypePredicate:
      return typePredicate(node as TypePredicateNode, context);
    case SyntaxKind.IndexedAccessType:
      return indexedAccessType(node as IndexedAccessTypeNode, context);
    case SyntaxKind.TemplateLiteralTypeSpan:
      return templateLiteralTypeSpan(node as TemplateLiteralTypeSpan, context);
    case SyntaxKind.TemplateLiteralType:
      return templateLiteralType(node as TemplateLiteralTypeNode, context);
    case SyntaxKind.ThisType:
      return thisType(node as ThisTypeNode, context);
    case SyntaxKind.ConditionalType:
      return conditionalType(node as ConditionalTypeNode, context);
    case SyntaxKind.ConstructorType:
    case SyntaxKind.NamedTupleMember:
    case SyntaxKind.OptionalType:
    case SyntaxKind.RestType:
    case SyntaxKind.InferType:
    case SyntaxKind.MappedType:
    case SyntaxKind.ImportType:
    case SyntaxKind.ExpressionWithTypeArguments:
    case SyntaxKind.JSDocTypeExpression:
    case SyntaxKind.JSDocAllType:
    case SyntaxKind.JSDocUnknownType:
    case SyntaxKind.JSDocNonNullableType:
    case SyntaxKind.JSDocNullableType:
    case SyntaxKind.JSDocOptionalType:
    case SyntaxKind.JSDocFunctionType:
    case SyntaxKind.JSDocVariadicType:
    case SyntaxKind.JSDocNamepathType:
    case SyntaxKind.JSDocSignature:
    case SyntaxKind.JSDocTypeLiteral:
      throw new Error(`TypeNode ${node.kind} (probably ${SyntaxKind[node.kind]}) was not implemented yet.
context: ${node.getText()}`);
    default:
      throw new Error(`Node ${node.kind} (probably ${SyntaxKind[node.kind]}) is not a TypeNode.
context: ${node.getText()}`);
  }
}

/**
 * whether it's kind of `ts.KeywordTypeSyntaxKind`
 */
function isKeywordType(node: TypeNode): node is KeywordTypeNode {
  switch (node.kind) {
    case SyntaxKind.AnyKeyword:
    case SyntaxKind.BigIntKeyword:
    case SyntaxKind.BooleanKeyword:
    case SyntaxKind.IntrinsicKeyword:
    case SyntaxKind.NeverKeyword:
    case SyntaxKind.NumberKeyword:
    case SyntaxKind.ObjectKeyword:
    case SyntaxKind.StringKeyword:
    case SyntaxKind.SymbolKeyword:
    case SyntaxKind.UndefinedKeyword:
    case SyntaxKind.UnknownKeyword:
    case SyntaxKind.VoidKeyword:
      return true;
    default:
      return false;
  }
}

async function intersectionType(node: IntersectionTypeNode, context: SchemaExtractorContext) {
  const types = await pMapSeries(node.types, async (type) => {
    const typeSchema = await typeNodeToSchema(type, context);
    return typeSchema;
  });
  const location = context.getLocation(node);
  return new TypeIntersectionSchema(location, types);
}

async function unionType(node: UnionTypeNode, context: SchemaExtractorContext) {
  const types = await pMapSeries(node.types, async (type) => {
    const typeSchema = await typeNodeToSchema(type, context);
    return typeSchema;
  });
  const location = context.getLocation(node);
  return new TypeUnionSchema(location, types);
}

/**
 * not to be confused with "LiteralType", which is string/boolean/null.
 * this "TypeLiteral" is an object with properties, such as: `{ a: string; b: number }`, similar to Interface.
 */
async function typeLiteral(node: TypeLiteralNode, context: SchemaExtractorContext) {
  const members = await pMapSeries(node.members, (member) => typeElementToSchema(member, context));
  const location = context.getLocation(node);
  return new TypeLiteralSchema(location, members);
}

/**
 * In the following example, `AriaButtonProps` is a type reference
 * ```ts
 * import type { AriaButtonProps } from '@react-types/button';
 * export type ButtonProps = AriaButtonProps & { a: string };
 * ```
 */
async function typeReference(node: TypeReferenceNode, context: SchemaExtractorContext) {
  const name = node.typeName.getText();
  const type = await context.resolveType(node, name, false);
  if (node.typeArguments && type instanceof TypeRefSchema) {
    const args = await pMapSeries(node.typeArguments, (arg) => typeNodeToSchema(arg, context));
    type.typeArgs = args;
  }
  return type;
}

async function functionType(node: FunctionTypeNode, context: SchemaExtractorContext): Promise<SchemaNode> {
  const name = node.name?.getText() || '';
  const params = await getParams(node.parameters, context);
  const returnType = await typeNodeToSchema(node.type, context);
  const location = context.getLocation(node);
  const modifiers = node.modifiers?.map((modifier) => modifier.getText()) || [];
  const doc = await context.jsDocToDocSchema(node, context);
  return new FunctionLikeSchema(location, name, params, returnType, '', modifiers as Modifier[], doc);
}

/**
 * e.g. `typeof Foo`
 */
async function typeQuery(node: TypeQueryNode, context: SchemaExtractorContext) {
  const displaySig = await context.getQuickInfoDisplayString(node.exprName);
  const type = await context.resolveType(node.exprName, node.exprName.getText(), false);
  const location = context.getLocation(node);
  return new TypeQuerySchema(location, type, displaySig);
}

async function arrayType(node: ArrayTypeNode, context: SchemaExtractorContext) {
  const type = await typeNodeToSchema(node.elementType, context);
  const location = context.getLocation(node);
  return new TypeArraySchema(location, type);
}

/**
 * e.g. keyof typeof Foo
 */
async function typeOperator(node: TypeOperatorNode, context: SchemaExtractorContext) {
  const operatorName = getOperatorName(node.operator);
  const type = await typeNodeToSchema(node.type, context);
  return new TypeOperatorSchema(context.getLocation(node), operatorName, type);
}

function getOperatorName(operator: SyntaxKind.KeyOfKeyword | SyntaxKind.UniqueKeyword | SyntaxKind.ReadonlyKeyword) {
  switch (operator) {
    case SyntaxKind.KeyOfKeyword:
      return 'keyof';
    case SyntaxKind.UniqueKeyword:
      return 'unique';
    case SyntaxKind.ReadonlyKeyword:
      return 'readonly';
    default:
      throw new Error(`getOperatorName: unable to find operator name for ${operator}`);
  }
}

async function tupleType(node: TupleTypeNode, context: SchemaExtractorContext) {
  const elements = await pMapSeries(node.elements, async (elem) => {
    const typeSchema = await typeNodeToSchema(elem, context);
    return typeSchema;
  });
  return new TupleTypeSchema(context.getLocation(node), elements);
}

async function parenthesizedType(node: ParenthesizedTypeNode, context: SchemaExtractorContext) {
  const type = await typeNodeToSchema(node.type, context);
  return new ParenthesizedTypeSchema(context.getLocation(node), type);
}

async function typePredicate(node: TypePredicateNode, context: SchemaExtractorContext) {
  const parameterName = isIdentifier(node.parameterName) ? node.parameterName.getText() : 'this';
  const type = node.type ? await typeNodeToSchema(node.type, context) : undefined;
  const hasAssertsModifier = Boolean(node.assertsModifier);
  return new TypePredicateSchema(context.getLocation(node), parameterName, type, hasAssertsModifier);
}

async function indexedAccessType(node: IndexedAccessTypeNode, context: SchemaExtractorContext) {
  const objectType = await typeNodeToSchema(node.objectType, context);
  const indexType = await typeNodeToSchema(node.indexType, context);
  return new IndexedAccessSchema(context.getLocation(node), objectType, indexType);
}

async function templateLiteralType(node: TemplateLiteralTypeNode, context: SchemaExtractorContext) {
  const templateSpans = await pMapSeries(node.templateSpans, (span) => templateLiteralTypeSpan(span, context));
  const head = node.head.text;
  return new TemplateLiteralTypeSchema(context.getLocation(node), head, templateSpans);
}

async function templateLiteralTypeSpan(node: TemplateLiteralTypeSpan, context: SchemaExtractorContext) {
  const type = await typeNodeToSchema(node.type, context);
  const literal = node.literal.text;
  return new TemplateLiteralTypeSpanSchema(context.getLocation(node), literal, type);
}

async function thisType(node: ThisTypeNode, context: SchemaExtractorContext) {
  return new ThisTypeSchema(context.getLocation(node));
}

async function conditionalType(node: ConditionalTypeNode, context: SchemaExtractorContext) {
  const checkType = await typeNodeToSchema(node.checkType, context);
  const extendsType = await typeNodeToSchema(node.extendsType, context);
  const trueType = await typeNodeToSchema(node.trueType, context);
  const falseType = await typeNodeToSchema(node.falseType, context);
  return new ConditionalTypeSchema(context.getLocation(node), checkType, extendsType, trueType, falseType);
}
