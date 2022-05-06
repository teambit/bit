import pMapSeries from 'p-map-series';
import { ClassSchema } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, ClassDeclaration } from 'typescript';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

export class ClassDecelerationTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.ClassDeclaration;
  }

  // @todo: in case of `export default class` the class has no name.
  private getName(node: ClassDeclaration) {
    return node.name?.getText() || 'default';
  }

  async getIdentifiers(node: ClassDeclaration) {
    return [new ExportIdentifier(this.getName(node), node.getSourceFile().fileName)];
  }

  async transform(node: ClassDeclaration, context: SchemaExtractorContext) {
    const className = this.getName(node);
    const members = await pMapSeries(node.members, async (member) => {
      return context.computeSchema(member);
    });
    return new ClassSchema(className, members);
  }
}
