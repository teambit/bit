import { Node, TypeOperatorNode, SyntaxKind } from 'typescript';
import { TypeOperatorSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { Identifier } from '../identifier';

/**
 * e.g. keyof typeof Foo
 */
export class TypeOperatorTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.TypeOperator;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: TypeOperatorNode, context: SchemaExtractorContext) {
    const operatorName = this.getOperatorName(node.operator);
    const type = await context.computeSchema(node.type);
    return new TypeOperatorSchema(context.getLocation(node), operatorName, type);
  }

  getOperatorName(operator: SyntaxKind.KeyOfKeyword | SyntaxKind.UniqueKeyword | SyntaxKind.ReadonlyKeyword) {
    switch (operator) {
      case SyntaxKind.KeyOfKeyword:
        return 'keyof';
      case SyntaxKind.UniqueKeyword:
        return 'unique';
      case SyntaxKind.ReadonlyKeyword:
        return 'readonly';
      default:
        throw new Error(`getOperatorName: unable to find operator name for ${operator}`);
    }
  }
}
