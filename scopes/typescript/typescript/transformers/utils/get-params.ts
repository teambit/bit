import pMapSeries from 'p-map-series';
import { ParameterDeclaration, NodeArray } from 'typescript';
import { SchemaExtractorContext } from '../../schema-extractor-context';

export async function getParams(parameterNodes: NodeArray<ParameterDeclaration>, context: SchemaExtractorContext) {
  return pMapSeries(parameterNodes, async (param) => {
    const type = param.type;
    return {
      name: param.name.getText(),
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      type: await context.resolveType(type!, type?.getText() || 'any'),
      defaultValue: param.initializer ? param.initializer.getText() : undefined,
    };
  });
}
