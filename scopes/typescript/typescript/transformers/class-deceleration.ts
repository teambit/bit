import pMapSeries from 'p-map-series';
import { ClassSchema } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, TypeAliasDeclaration, ClassDeclaration } from 'typescript';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

export class ClassDecelerationTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.ClassDeclaration;
  }

  async getIdentifiers(node: TypeAliasDeclaration) {
    return [new ExportIdentifier(node.name.getText(), node.getSourceFile().fileName)];
  }

  async transform(node: ClassDeclaration, context: SchemaExtractorContext) {
    const className = node.name?.getText() as string;
    const members = await pMapSeries(node.members, async (member) => {
      return context.computeSchema(member);
    });
    return new ClassSchema(className, members);
  }
}
