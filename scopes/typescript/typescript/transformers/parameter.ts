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
    return new ParameterSchema(
      context.getLocation(node),
      this.getName(node),
      await this.getType(node, context),
      Boolean(node.questionToken),
      node.initializer ? node.initializer.getText() : undefined,
      undefined,
      await this.getObjectBindingNodes(node, context)
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
    context: SchemaExtractorContext
  ): Promise<SchemaNode[] | undefined> {
    if (param.name.kind !== SyntaxKind.ObjectBindingPattern) return undefined;
    return pMapSeries(param.name.elements, async (elem: BindingElement) => {
      const info =
        elem.name.kind === SyntaxKind.ObjectBindingPattern ? undefined : await context.getQuickInfo(elem.name);
      // @todo look into extracting nested objected binding patters
      /**
         * apiNode: {
            api: {
              name,
              signature: defaultSignature,
              doc, 
              location: { filePath },
            },
          },
         */
      const parsed = info ? parseTypeFromQuickInfo(info) : elem.getText();
      return new InferenceTypeSchema(context.getLocation(param), parsed, elem.name.getText());
    });
  }
}
