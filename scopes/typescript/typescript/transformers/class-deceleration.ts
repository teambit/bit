import pMapSeries from 'p-map-series';
import { compact } from 'lodash';
import { ClassSchema } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, ClassDeclaration } from 'typescript';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';
import { jsDocToDocSchema } from './utils/jsdoc-to-doc-schema';
import { classElementToSchema } from './utils/class-element-to-schema';

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
      const isPrivate = member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword);
      if (isPrivate) {
        return null;
      }
      return classElementToSchema(member, context);
    });
    const doc = await jsDocToDocSchema(node, context);
    return new ClassSchema(className, compact(members), context.getLocation(node), doc);
  }
}
