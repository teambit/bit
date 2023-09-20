import ts, {
  BindingElement,
  isIdentifier,
  Node,
  ParameterDeclaration,
  SyntaxKind,
  ArrayBindingElement,
} from 'typescript';
import {
  InferenceTypeSchema,
  ParameterSchema,
  SchemaNode,
  TupleTypeSchema,
  TypeLiteralSchema,
} from '@teambit/semantics.entities.semantic-schema';
import pMapSeries from 'p-map-series';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { parseTypeFromQuickInfo } from './utils/parse-type-from-quick-info';
import { Identifier } from '../identifier';

export class ParameterTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.Parameter;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: ParameterDeclaration, context: SchemaExtractorContext) {
    const type = await this.getType(node, context);
    return new ParameterSchema(
      context.getLocation(node),
      this.getName(node),
      type,
      Boolean(node.questionToken),
      node.initializer ? node.initializer.getText() : undefined,
      undefined,
      await this.getObjectBindingNodes(node, type, context),
      Boolean(node.dotDotDotToken)
    );
  }

  getName(param: ParameterDeclaration): string {
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

  async getType(param: ParameterDeclaration, context: SchemaExtractorContext): Promise<SchemaNode> {
    if (param.type) {
      return context.computeSchema(param.type);
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

  async getObjectBindingNodes(
    param: ParameterDeclaration,
    paramType: SchemaNode,
    context: SchemaExtractorContext
  ): Promise<SchemaNode[] | undefined> {
    if (param.name.kind !== SyntaxKind.ObjectBindingPattern) return undefined;
    return pMapSeries(param.name.elements, async (elem: BindingElement) => {
      const existing = paramType.findNode?.((node) => {
        return node.name === elem.name.getText().trim();
      });
      if (existing) return existing;
      const info = await context.getQuickInfo(elem.name);
      const parsed = info ? parseTypeFromQuickInfo(info) : elem.getText();
      const defaultValue = elem.initializer ? elem.initializer.getText() : undefined;
      return new InferenceTypeSchema(
        context.getLocation(elem.name),
        parsed,
        elem.name.getText(),
        defaultValue,
        Boolean(elem.dotDotDotToken)
      );
    });
  }
}
