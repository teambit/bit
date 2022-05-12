import ts, {
  TypeNode,
  SyntaxKind,
  KeywordTypeNode,
  FunctionTypeNode,
  TypeQueryNode,
  TypeReferenceNode,
  ArrayTypeNode,
  TypeOperatorNode,
} from 'typescript';
import {
  SchemaNode,
  TypeIntersectionSchema,
  TypeUnionSchema,
  TypeLiteralSchema,
  FunctionSchema,
  TypeQuerySchema,
  LiteralTypeSchema,
  KeywordTypeSchema,
  TypeArraySchema,
  TypeOperatorSchema,
} from '@teambit/semantics.entities.semantic-schema';
import pMapSeries from 'p-map-series';
import { SchemaExtractorContext } from '../../schema-extractor-context';
import { getParams } from './get-params';

// eslint-disable-next-line complexity
export async function typeNodeToSchema(node: TypeNode, context: SchemaExtractorContext): Promise<SchemaNode> {
  if (isKeywordType(node)) {
    return new KeywordTypeSchema(node.getText());
  }
  switch (node.kind) {
    case SyntaxKind.IntersectionType: {
      const types = await pMapSeries((node as ts.IntersectionTypeNode).types, async (type) => {
        const typeSchema = await typeNodeToSchema(type, context);
        return typeSchema;
      });
      return new TypeIntersectionSchema(types);
    }
    case SyntaxKind.UnionType: {
      const types = await pMapSeries((node as ts.UnionTypeNode).types, async (type) => {
        const typeSchema = await typeNodeToSchema(type, context);
        return typeSchema;
      });
      return new TypeUnionSchema(types);
    }

    case SyntaxKind.TypeReference: {
      return typeReference(node as TypeReferenceNode, context);
    }
    case SyntaxKind.TypeLiteral: {
      // not to be confused with "LiteralType", which is string/boolean/null.
      // this "TypeLiteral" is an object with properties, such as: `{ a: string; b: number }`, similar to Interface.
      const members = await pMapSeries((node as ts.TypeLiteralNode).members, async (member) => {
        const typeSchema = await context.computeSchema(member);
        return typeSchema;
      });
      return new TypeLiteralSchema(members);
    }
    case SyntaxKind.LiteralType: // e.g. string/boolean
      return new LiteralTypeSchema(node.getText());
    case SyntaxKind.FunctionType: {
      return functionType(node as FunctionTypeNode, context);
    }
    case SyntaxKind.TypeQuery:
      return typeQuery(node as TypeQueryNode, context);
    case SyntaxKind.ArrayType:
      return arrayType(node as ArrayTypeNode, context);
    case SyntaxKind.TypeOperator:
      return typeOperator(node as TypeOperatorNode, context);
    case SyntaxKind.TypePredicate:
    case SyntaxKind.ConstructorType:
    case SyntaxKind.TupleType:
    case SyntaxKind.NamedTupleMember:
    case SyntaxKind.OptionalType:
    case SyntaxKind.RestType:
    case SyntaxKind.ConditionalType:
    case SyntaxKind.InferType:
    case SyntaxKind.ParenthesizedType:
    case SyntaxKind.ThisType:
    case SyntaxKind.IndexedAccessType:
    case SyntaxKind.MappedType:
    case SyntaxKind.TemplateLiteralType:
    case SyntaxKind.TemplateLiteralTypeSpan:
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
      throw new Error(`TypeNode "${SyntaxKind[node.kind]}" was not implemented yet.
context: ${node.getText()}`);
    default:
      throw new Error(`Node "${SyntaxKind[node.kind]}" is not a TypeNode.
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
  return type;
}

async function functionType(node: FunctionTypeNode, context: SchemaExtractorContext): Promise<SchemaNode> {
  const name = node.name?.getText() || '';
  const params = await getParams(node.parameters, context);
  const returnType = await typeNodeToSchema(node.type, context);
  return new FunctionSchema(name, params, returnType, '');
}

/**
 * e.g. `typeof Foo`
 */
async function typeQuery(node: TypeQueryNode, context: SchemaExtractorContext) {
  const displaySig = await context.getQuickInfoDisplayString(node.exprName);
  const type = await context.resolveType(node.exprName, node.exprName.getText(), false);
  return new TypeQuerySchema(type, displaySig);
}

async function arrayType(node: ArrayTypeNode, context: SchemaExtractorContext) {
  const type = await typeNodeToSchema(node.elementType, context);
  return new TypeArraySchema(type);
}

/**
 * e.g. keyof typeof Foo
 */
async function typeOperator(node: TypeOperatorNode, context: SchemaExtractorContext) {
  const operatorName = getOperatorName(node.operator);
  const type = await typeNodeToSchema(node.type, context);
  return new TypeOperatorSchema(operatorName, type);
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
