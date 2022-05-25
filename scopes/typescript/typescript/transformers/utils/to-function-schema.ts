import { SignatureDeclaration } from 'typescript';
import { FunctionLikeSchema, Modifier } from '@teambit/semantics.entities.semantic-schema';
import { SchemaExtractorContext } from '../../schema-extractor-context';
import { getParams } from './get-params';
import { parseTypeFromQuickInfo } from './parse-type-from-quick-info';

export async function toFunctionLikeSchema(node: SignatureDeclaration, context: SchemaExtractorContext) {
  const name = node.name?.getText() || '';
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const info = await context.getQuickInfo(node.name!);
  const returnTypeStr = parseTypeFromQuickInfo(info);
  const displaySig = info?.body?.displayString || '';
  const args = await getParams(node.parameters, context);
  const returnType = await context.resolveType(node, returnTypeStr);
  const modifiers = node.modifiers?.map((modifier) => modifier.getText()) || [];
  const location = context.getLocation(node);

  return new FunctionLikeSchema(location, name, args, returnType, displaySig, modifiers as Modifier[]);
}
