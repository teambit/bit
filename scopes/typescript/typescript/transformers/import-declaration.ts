import { ImportDeclaration, Node, SyntaxKind } from 'typescript';
import { UnImplementedSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { Identifier } from '../identifier';

export class ImportDeclarationTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.ImportDeclaration;
  }

  async getIdentifiers(importDec: ImportDeclaration): Promise<Identifier[]> {
    if (!importDec.importClause) return [];

    const sourceFile = importDec.getSourceFile().fileName;
    const rawSourceFilePath = importDec.moduleSpecifier.getText();
    const sourceFilePath = rawSourceFilePath.substring(1, rawSourceFilePath.length - 1);

    // import A from 'a'
    if (!importDec.importClause.namedBindings) {
      return [new Identifier(importDec.importClause.getText(), sourceFile, undefined, sourceFilePath)];
    }

    // import { A } from 'a'
    if (importDec.importClause.namedBindings?.kind === SyntaxKind.NamedImports) {
      const { elements } = importDec.importClause.namedBindings;

      return elements.map(({ name, propertyName }) => {
        const id = propertyName?.getText() || name.getText();
        const alias = (propertyName && name.getText()) || undefined;
        const identifier = new Identifier(id, sourceFile, alias, sourceFilePath);
        return identifier;
      });
    }

    // import * as A from 'a';
    if (importDec.importClause.namedBindings.kind === SyntaxKind.NamespaceImport) {
      return [
        new Identifier(
          importDec.importClause.namedBindings.name.getText(),
          sourceFile,
          undefined,
          importDec.moduleSpecifier.getText()
        ),
      ];
    }

    return [];
  }

  async transform(node: ImportDeclaration, context: SchemaExtractorContext) {
    const location = context.getLocation(node);

    return new UnImplementedSchema(location, node.getText(), node.kind.toString());
  }
}
