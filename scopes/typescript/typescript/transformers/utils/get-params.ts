import { Parameter, TypeRefSchema } from '@teambit/semantics.entities.semantic-schema';
import pMapSeries from 'p-map-series';
import { ParameterDeclaration, NodeArray } from 'typescript';
import { SchemaExtractorContext } from '../../schema-extractor-context';
import { parseTypeFromQuickInfo } from './parse-type-from-quick-info';

export async function getParams(
  parameterNodes: NodeArray<ParameterDeclaration>,
  context: SchemaExtractorContext
): Promise<Parameter[]> {
  return pMapSeries(parameterNodes, async (param) => {
    return {
      name: param.name.getText(),
      type: await getParamType(param, context),
      defaultValue: param.initializer ? param.initializer.getText() : undefined,
    };
  });
}

async function getParamType(param: ParameterDeclaration, context: SchemaExtractorContext): Promise<TypeRefSchema> {
  if (param.type) {
    const type = param.type;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return context.resolveType(type!, type?.getText() || 'any');
  }
  const info = await context.getQuickInfo(param.name);
  const displaySig = info?.body?.displayString;
  const parsed = parseTypeFromQuickInfo(displaySig);
  return new TypeRefSchema(parsed || 'any');
}
