import { FunctionSchema, SchemaNode, VariableSchema } from '@teambit/semantics.entities.semantic-schema';
import ts, { FunctionTypeNode, Node, PropertySignature as PropertySignatureNode } from 'typescript';
import { getParams } from './utils/get-params';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { parseReturnTypeFromQuickInfo, parseTypeFromQuickInfo } from './utils/parse-type-from-quick-info';

export class PropertySignature implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.PropertySignature;
  }

  getName(node: PropertySignatureNode) {
    return node.name.getText();
  }

  async getIdentifiers() {
    return [];
  }

  async transform(prop: PropertySignatureNode, context: SchemaExtractorContext): Promise<SchemaNode> {
    const name = this.getName(prop);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const info = await context.getQuickInfo(prop.name!);
    const displaySig = info?.body?.displayString || '';
    if (prop.type?.kind === ts.SyntaxKind.FunctionType) {
      // e.g. `propertySig: () => void;` inside interface
      const propType = prop.type as FunctionTypeNode;
      const args = await getParams(propType.parameters, context);
      const typeStr = parseReturnTypeFromQuickInfo(displaySig);
      const returnType = await context.resolveType(propType, typeStr);
      return new FunctionSchema(name, args, returnType, displaySig);
    }
    const typeStr = parseTypeFromQuickInfo(displaySig);
    const type = await context.resolveType(prop, typeStr);
    return new VariableSchema(name, displaySig, type);
  }
}
