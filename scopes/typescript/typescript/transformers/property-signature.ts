import { SchemaNode, VariableSchema } from '@teambit/semantics.entities.semantic-schema';
import ts, { FunctionTypeNode, Node, PropertySignature as PropertySignatureNode } from 'typescript';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { parseTypeFromQuickInfo } from './utils/parse-type-from-quick-info';
import { toFunctionLikeSchema } from './utils/to-function-schema';

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
    const info = await context.getQuickInfo(prop.name);
    const displaySig = info?.body?.displayString || '';
    if (prop.type?.kind === ts.SyntaxKind.FunctionType) {
      // e.g. `propertySig: () => void;` inside interface
      const propType = prop.type as FunctionTypeNode;
      return toFunctionLikeSchema(propType, context);
    }
    const typeStr = parseTypeFromQuickInfo(info);
    const type = await context.resolveType(prop, typeStr);
    return new VariableSchema(name, displaySig, type);
  }
}
