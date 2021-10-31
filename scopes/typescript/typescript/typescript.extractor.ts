import ts, { Node, SourceFile } from 'typescript';
import { SchemaExtractor } from '@teambit/schema';
import { TsserverClient } from '@teambit/ts-server';
import { SemanticSchema } from '@teambit/semantics.entities.semantic-schema';
import { Component } from '@teambit/component';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { compact, flatten } from 'lodash';
import { TypescriptMain } from './typescript.main.runtime';
import { SchemaTransformerSlot } from './typescript.main.runtime';
import { TransformerNotFound } from './exceptions';
import { SchemaExtractorContext } from './schema-extractor-context';

export class TypeScriptExtractor implements SchemaExtractor {
  constructor(
    private tsconfig: any,
    private schemaTransformerSlot: SchemaTransformerSlot,
    private tsMain: TypescriptMain,
    private rootPath: string
  ) {}

  parseSourceFile(file: AbstractVinyl) {
    return ts.createSourceFile(
      file.path,
      file.contents.toString('utf8'),
      ts.ScriptTarget.Latest,
      true,
      this.tsconfig.compilerOptions
    );
  }

  /**
   * extract a component schema.
   */
  async extract(component: Component) {
    const tsserver = await this.getTsServer();
    const mainFile = component.mainFile;
    const mainAst = this.parseSourceFile(mainFile);

    const context = this.createContext(tsserver, component);
    const exports = this.listExports(mainAst);
    const schemas = await Promise.all(
      exports.map((node) => {
        return this.computeSchema(node, context);
      })
    );

    return SemanticSchema.from({});
  }

  private createContext(tsserver: TsserverClient, component: Component): SchemaExtractorContext {
    return new SchemaExtractorContext(tsserver, component, this);
  }

  private tsserver: TsserverClient | undefined = undefined;

  private async getTsServer() {
    if (!this.tsserver) {
      const tsserver = this.tsMain.getTsserverClient();
      if (tsserver) {
        this.tsserver = tsserver;
        return tsserver;
      }

      this.tsserver = await this.tsMain.initTsserverClient(this.rootPath);
      return this.tsserver;
    }

    return this.tsserver;
  }

  async computeSchema(node: Node, context: SchemaExtractorContext) {
    const transformer = this.getTransformer(node, context.component);
    if (!transformer) return;
    return transformer.transform(node, context);
  }

  /**
   * select the correct transformer for a node.
   */
  private getTransformer(node: Node, component: Component) {
    const transformers = flatten(this.schemaTransformerSlot.values());
    const transformer = transformers.find((transformer) => transformer.predicate(node));

    if (!transformer) {
      // throw new TransformerNotFound(node, component);
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
