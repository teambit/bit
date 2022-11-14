import {
  InferenceTypeSchema,
  ParameterSchema,
  TupleTypeSchema,
  TypeLiteralSchema,
  SchemaNode,
} from '@teambit/semantics.entities.semantic-schema';
import pMapSeries from 'p-map-series';
import {
  SyntaxKind,
  ParameterDeclaration,
  NodeArray,
  isIdentifier,
  BindingElement,
  ArrayBindingElement,
} from 'typescript';
import { SchemaExtractorContext } from '../../schema-extractor-context';
import { parseTypeFromQuickInfo } from './parse-type-from-quick-info';
import { typeNodeToSchema } from './type-node-to-schema';

export async function getParams(
  parameterNodes: NodeArray<ParameterDeclaration>,
  context: SchemaExtractorContext
): Promise<ParameterSchema[]> {
  return pMapSeries(parameterNodes, async (param) => {
    return new ParameterSchema(
      context.getLocation(param),
      getParamName(param),
      await getParamType(param, context),
      Boolean(param.questionToken),
      param.initializer ? param.initializer.getText() : undefined,
      undefined,
      await getParamObjectBindingNodes(param, context)
    );
  });
}

function getParamName(param: ParameterDeclaration): string {
  if (isIdentifier(param.name)) {
    return param.name.getText();
  }
  // it's binding pattern, either an array or an object
  const elements = param.name.elements.map((elem) => elem.getText());
  const elementsStr = elements.join(', ');
  if (param.name.kind === SyntaxKind.ArrayBindingPattern) {
    return `[ ${elementsStr} ]`;
  }
  // it's an object binding
  return `{ ${elementsStr} }`;
}

async function getParamObjectBindingNodes(
  param: ParameterDeclaration,
  context: SchemaExtractorContext
): Promise<SchemaNode[] | undefined> {
  if (param.name.kind !== SyntaxKind.ObjectBindingPattern) return undefined;
  return pMapSeries(param.name.elements, async (elem: BindingElement) => {
    const info = await context.getQuickInfo(elem.name);
    const parsed = parseTypeFromQuickInfo(info);
    return new InferenceTypeSchema(context.getLocation(param), parsed, elem.name.getText());
  });
}

async function getParamType(param: ParameterDeclaration, context: SchemaExtractorContext): Promise<SchemaNode> {
  if (param.type) {
    const type = param.type;
    return typeNodeToSchema(type, context);
  }
  if (isIdentifier(param.name)) {
    const info = await context.getQuickInfo(param.name);
    const parsed = parseTypeFromQuickInfo(info);
    return new InferenceTypeSchema(context.getLocation(param), parsed);
  }
  // it's binding pattern, either an array or an object
  if (param.name.kind === SyntaxKind.ArrayBindingPattern) {
    const elements = await pMapSeries(param.name.elements, async (elem: ArrayBindingElement) => {
      const info = await context.getQuickInfo(elem);
      const parsed = parseTypeFromQuickInfo(info);
      return new InferenceTypeSchema(context.getLocation(param), parsed);
    });
    return new TupleTypeSchema(context.getLocation(param), elements);
  }
  if (param.name.kind === SyntaxKind.ObjectBindingPattern) {
    const elements = await pMapSeries(param.name.elements, async (elem: BindingElement) => {
      const info = await context.getQuickInfo(elem.name);
      const parsed = parseTypeFromQuickInfo(info);
      return new InferenceTypeSchema(context.getLocation(param), parsed, elem.name.getText());
    });
    return new TypeLiteralSchema(context.getLocation(param), elements);
  }
  throw new Error(`unknown param type`);
}
