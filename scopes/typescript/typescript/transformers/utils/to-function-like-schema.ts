import { SignatureDeclaration } from 'typescript';
import { FunctionLikeSchema, Modifier } from '@teambit/semantics.entities.semantic-schema';
import { SchemaExtractorContext } from '../../schema-extractor-context';
import { getParams } from './get-params';
import { parseTypeFromQuickInfo } from './parse-type-from-quick-info';
import { jsDocToDocSchema } from './jsdoc-to-doc-schema';

export async function toFunctionLikeSchema(
  node: SignatureDeclaration,
  context: SchemaExtractorContext,
  funcName?: string
) {
  const name = funcName || node.name?.getText() || '';
  const info = node.name ? await context.getQuickInfo(node.name) : null;
  const returnTypeStr = info ? parseTypeFromQuickInfo(info) : 'any';
  const displaySig = info?.body?.displayString || '';
  const args = await getParams(node.parameters, context);
  const returnType = await context.resolveType(node, returnTypeStr, Boolean(info));
  const modifiers = node.modifiers?.map((modifier) => modifier.getText()) || [];
  const typeParameters = node.typeParameters?.map((typeParam) => typeParam.name.getText());
  const location = context.getLocation(node);
  const doc = await jsDocToDocSchema(node, context);
  return new FunctionLikeSchema(
    location,
    name,
    args,
    returnType,
    displaySig,
    modifiers as Modifier[],
    doc,
    typeParameters
  );
}
