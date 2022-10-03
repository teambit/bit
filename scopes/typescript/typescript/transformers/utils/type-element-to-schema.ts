import ts, {
  SyntaxKind,
  TypeElement,
  MethodSignature,
  isComputedPropertyName,
  IndexSignatureDeclaration,
  GetAccessorDeclaration,
  SetAccessorDeclaration,
  ConstructSignatureDeclaration,
  CallSignatureDeclaration,
} from 'typescript';
import {
  GetAccessorSchema,
  IndexSignatureSchema,
  SchemaNode,
  SetAccessorSchema,
  VariableLikeSchema,
} from '@teambit/semantics.entities.semantic-schema';
import { toFunctionLikeSchema } from './to-function-like-schema';
import { SchemaExtractorContext } from '../../schema-extractor-context';
import { parseTypeFromQuickInfo } from './parse-type-from-quick-info';
import { typeNodeToSchema } from './type-node-to-schema';
import { getParams } from './get-params';

export async function typeElementToSchema(node: TypeElement, context: SchemaExtractorContext): Promise<SchemaNode> {
  switch (node.kind) {
    case SyntaxKind.MethodSignature:
      return toFunctionLikeSchema(node as MethodSignature, context);
    case SyntaxKind.ConstructSignature:
      return toFunctionLikeSchema(node as ConstructSignatureDeclaration, context, 'new');
    case SyntaxKind.CallSignature:
      return callSignature(node as CallSignatureDeclaration, context);
    case SyntaxKind.PropertySignature:
      return propertySignature(node as ts.PropertySignature, context);
    case SyntaxKind.IndexSignature:
      return indexSignature(node as IndexSignatureDeclaration, context);
    case SyntaxKind.GetAccessor:
      return getAccessor(node as GetAccessorDeclaration, context);
    case SyntaxKind.SetAccessor:
      return setAccessor(node as SetAccessorDeclaration, context);
    default:
      throw new Error(`typeElementToSchema expect type-element node. got ${node.kind}`);
  }
}

async function propertySignature(node: ts.PropertySignature, context: SchemaExtractorContext) {
  const name = node.name.getText();
  const info = isComputedPropertyName(node.name) ? undefined : await context.getQuickInfo(node.name);
  const displaySig = info?.body?.displayString || '';
  const typeStr = parseTypeFromQuickInfo(info);
  const type = await context.resolveType(node, typeStr);
  const isOptional = Boolean(node.questionToken);
  const doc = await context.jsDocToDocSchema(node, context);
  return new VariableLikeSchema(context.getLocation(node), name, displaySig, type, isOptional, doc);
}

export async function indexSignature(node: IndexSignatureDeclaration, context: SchemaExtractorContext) {
  const params = await getParams(node.parameters, context);
  const type = await typeNodeToSchema(node.type, context);
  return new IndexSignatureSchema(context.getLocation(node), params, type);
}

export async function getAccessor(node: GetAccessorDeclaration, context: SchemaExtractorContext) {
  const info = await context.getQuickInfo(node.name);
  const displaySig = info?.body?.displayString || '';
  const typeStr = parseTypeFromQuickInfo(info);
  const type = await context.resolveType(node, typeStr);
  return new GetAccessorSchema(context.getLocation(node), node.name.getText(), type, displaySig);
}

export async function setAccessor(node: SetAccessorDeclaration, context: SchemaExtractorContext) {
  const params = await getParams(node.parameters, context);
  const displaySig = await context.getQuickInfoDisplayString(node.name);
  return new SetAccessorSchema(context.getLocation(node), node.name.getText(), params[0], displaySig);
}

async function callSignature(node: CallSignatureDeclaration, context: SchemaExtractorContext) {
  return toFunctionLikeSchema(node, context);
}
