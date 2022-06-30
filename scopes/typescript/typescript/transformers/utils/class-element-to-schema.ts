import {
  ClassElement,
  ConstructorDeclaration,
  GetAccessorDeclaration,
  IndexSignatureDeclaration,
  MethodDeclaration,
  PropertyDeclaration,
  SetAccessorDeclaration,
  SyntaxKind,
} from 'typescript';
import { ConstructorSchema, SchemaNode, VariableLikeSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaExtractorContext } from '../../schema-extractor-context';
import { getParams } from './get-params';
import { getAccessor, indexSignature, setAccessor } from './type-element-to-schema';
import { parseTypeFromQuickInfo } from './parse-type-from-quick-info';
import { toFunctionLikeSchema } from './to-function-like-schema';
import { jsDocToDocSchema } from './jsdoc-to-doc-schema';

export async function classElementToSchema(
  node: ClassElement,
  context: SchemaExtractorContext
): Promise<SchemaNode | null> {
  switch (node.kind) {
    case SyntaxKind.Constructor:
      return constructor(node as ConstructorDeclaration, context);
    case SyntaxKind.PropertyDeclaration:
      return propertyDeclaration(node as PropertyDeclaration, context);
    case SyntaxKind.MethodDeclaration:
      return methodDeclaration(node as MethodDeclaration, context);
    case SyntaxKind.GetAccessor:
      return getAccessor(node as GetAccessorDeclaration, context);
    case SyntaxKind.SetAccessor:
      return setAccessor(node as SetAccessorDeclaration, context);
    case SyntaxKind.IndexSignature:
      return indexSignature(node as IndexSignatureDeclaration, context);
    case SyntaxKind.ClassStaticBlockDeclaration: // not sure what is it, but the name sounds like not something we need
    case SyntaxKind.SemicolonClassElement: // seems to be just a semicolon
      return null;
    default:
      // should never be here unless typescript added new class elements
      throw new Error(`unrecognized ClassElement type. got ${node.kind}`);
  }
}

async function constructor(node: ConstructorDeclaration, context: SchemaExtractorContext) {
  const args = await getParams(node.parameters, context);
  return new ConstructorSchema(context.getLocation(node), args);
}

async function propertyDeclaration(node: PropertyDeclaration, context: SchemaExtractorContext) {
  const name = node.name.getText();
  const info = await context.getQuickInfo(node.name);
  const displaySig = info?.body?.displayString;
  const typeStr = parseTypeFromQuickInfo(info);
  const type = await context.resolveType(node, typeStr);
  const isOptional = Boolean(node.questionToken);
  const doc = await jsDocToDocSchema(node, context);
  return new VariableLikeSchema(context.getLocation(node), name, displaySig || '', type, isOptional, doc);
}

async function methodDeclaration(node: MethodDeclaration, context: SchemaExtractorContext) {
  return toFunctionLikeSchema(node, context);
}
