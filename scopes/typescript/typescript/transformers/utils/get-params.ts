import { ParameterSchema, SchemaNode, TypeRefSchema } from '@teambit/semantics.entities.semantic-schema';
import pMapSeries from 'p-map-series';
import { ParameterDeclaration, NodeArray } from 'typescript';
import { SchemaExtractorContext } from '../../schema-extractor-context';
import { parseTypeFromQuickInfo } from './parse-type-from-quick-info';
import { typeNodeToSchema } from './type-node-to-schema';

export async function getParams(
  parameterNodes: NodeArray<ParameterDeclaration>,
  context: SchemaExtractorContext
): Promise<ParameterSchema[]> {
  return pMapSeries(parameterNodes, async (param) => {
    return new ParameterSchema(
      param.name.getText(),
      await getParamType(param, context),
      param.initializer ? param.initializer.getText() : undefined
    );
  });
}

/**
 * @todo: probably not needed. just call context.resolveType instead.
 */
async function getParamType(param: ParameterDeclaration, context: SchemaExtractorContext): Promise<SchemaNode> {
  if (param.type) {
    const type = param.type;
    return typeNodeToSchema(type, context);
  }
  const info = await context.getQuickInfo(param.name);
  const parsed = parseTypeFromQuickInfo(info);
  return new TypeRefSchema(context.getLocation(param), parsed || 'any');
}
