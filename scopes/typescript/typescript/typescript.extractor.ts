import ts, { Node, SourceFile } from 'typescript';
import { SchemaExtractor } from '@teambit/schema';
import { compact, flatten } from 'lodash';
import { SemanticSchema } from '@teambit/semantics.entities.semantic-schema';
import { Component } from '@teambit/component';
import { SchemaTransformerSlot } from './typescript.main.runtime';
import { TransformerNotFound } from './exceptions';
import { SchemaExtractorContext } from './schema-extractor-context';

export class TypeScriptExtractor implements SchemaExtractor {
  constructor(private tsconfig: any, private schemaTransformerSlot: SchemaTransformerSlot) {}

  /**
   * extract a component schema.
   */
  async extract(component: Component) {
    const mainFile = component.mainFile;
    const mainAst = ts.createSourceFile(
      mainFile.relative,
      mainFile.contents.toString('utf8'),
      ts.ScriptTarget.Latest,
      true,
      this.tsconfig.compilerOptions
    );

    const exports = this.listExports(mainAst);
    const schemas = exports.map((node) => {
      return this.computeSchema(node, component);
    });

    return SemanticSchema.from({});
  }

  private createContext(): SchemaExtractorContext {
    return new SchemaExtractorContext();
  }

  private computeSchema(node: Node, component: Component) {
    const transformer = this.getTransformer(node, component);
    return transformer.transform(node);
  }

  /**
   * select the correct transformer for a node.
   */
  private getTransformer(node: Node, component: Component) {
    const transformers = flatten(this.schemaTransformerSlot.values());
    const transformer = transformers.find((transformer) => transformer.predicate(node));

    if (!transformer) {
      throw new TransformerNotFound(node, component);
    }

    return transformer;
  }

  /**
   * list all exports of a source file.
   */
  private listExports(ast: SourceFile): Node[] {
    return compact(
      ast.statements.map((statement) => {
        if (statement.kind === ts.SyntaxKind.ExportDeclaration) return statement;
        const isExport = Boolean(
          statement.modifiers?.find((modifier) => {
            return modifier.kind === ts.SyntaxKind.ExportKeyword;
          })
        );

        if (isExport) return statement;
      })
    );
  }
}
