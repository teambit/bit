import { SignatureDeclaration, SyntaxKind } from 'typescript';
import pMapSeries from 'p-map-series';
import { FunctionLikeSchema, Modifier, ParameterSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaExtractorContext } from '../../schema-extractor-context';
import { parseTypeFromQuickInfo } from './parse-type-from-quick-info';

export async function toFunctionLikeSchema(
  node: SignatureDeclaration,
  context: SchemaExtractorContext,
  funcName?: string
) {
  const name = funcName || node.name?.getText() || '';
  const getQuickInfoFromDefaultModifier = async () => {
    const defaultModifier = node.modifiers?.find((modifier) => modifier.kind === SyntaxKind.DefaultKeyword);
    if (defaultModifier) return context.getQuickInfo(defaultModifier);
    if (node.kind === SyntaxKind.ArrowFunction) return context.getQuickInfo(node.equalsGreaterThanToken);
    return null;
  };
  const info = node.name ? await context.getQuickInfo(node.name) : await getQuickInfoFromDefaultModifier();
  const returnTypeStr = info ? parseTypeFromQuickInfo(info) : 'any';
  const displaySig = info?.body?.displayString || '';
  const args = (await pMapSeries(node.parameters, async (param) => context.computeSchema(param))) as ParameterSchema[];

  const returnType = await context.resolveType(node, returnTypeStr, Boolean(info));
  const modifiers = node.modifiers?.map((modifier) => modifier.getText()) || [];
  const typeParameters = node.typeParameters?.map((typeParam) => typeParam.name.getText());
  const location = context.getLocation(node);
  const doc = await context.jsDocToDocSchema(node);

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
