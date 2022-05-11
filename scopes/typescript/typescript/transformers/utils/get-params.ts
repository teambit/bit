import { Parameter, SchemaNode, TypeRefSchema } from '@teambit/semantics.entities.semantic-schema';
import pMapSeries from 'p-map-series';
import { ParameterDeclaration, NodeArray } from 'typescript';
import { SchemaExtractorContext } from '../../schema-extractor-context';
import { parseTypeFromQuickInfo } from './parse-type-from-quick-info';
import { typeNodeToSchema } from './type-node-to-schema';

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

async function getParamType(param: ParameterDeclaration, context: SchemaExtractorContext): Promise<SchemaNode> {
  if (param.type) {
    const type = param.type;
    return typeNodeToSchema(type, context);
  }
  const info = await context.getQuickInfo(param.name);
  const parsed = parseTypeFromQuickInfo(info);
  return new TypeRefSchema(parsed || 'any');
}
