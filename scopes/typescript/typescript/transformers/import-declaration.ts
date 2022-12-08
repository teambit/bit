import { ImportClause, ImportDeclaration, Node, SyntaxKind } from 'typescript';
import { TypeRefSchema, UnImplementedSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { Identifier } from '../identifier';

export class ImportDeclarationTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.ImportDeclaration;
  }

  async getIdentifiers(importDec: ImportDeclaration, context: SchemaExtractorContext): Promise<Identifier[]> {
    /**
     * import { A } from 'a'
     *  */
    if (importDec.importClause?.namedBindings?.kind === SyntaxKind.NamedImports) {
      const { elements } = importDec.importClause.namedBindings;
      const fileName = importDec.getSourceFile().fileName;
      //   console.log(
      //     '🚀 ~ file: import-declaration.ts:19 ~ ImportDeclarationTransformer ~ getIdentifiers ~ fileName',
      //     fileName
      //   );
      return elements.map(({ name, propertyName }) => {
        const id = propertyName?.getText() || name.getText();
        const identifier = new Identifier(id, fileName);
        // console.log("🚀 ~ file: import-declaration.ts:26 ~ ImportDeclarationTransformer ~ returnelements.map ~ identifier", identifier)
        return identifier;
      });
    }
    // console.log(
    //   "🚀 ~ file: import-declaration.ts:32 ~ ImportDeclarationTransformer ~ getIdentifiers ~ import A from 'a'"
    // );

    /**
     * import A from 'a'
     */
    return [];
  }

  async transform(node: ImportClause, context: SchemaExtractorContext) {
    const location = context.getLocation(node);

    return new UnImplementedSchema(location, node.getText(), node.kind.toString());
  }
}
