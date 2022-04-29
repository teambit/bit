import ts, { Node } from 'typescript';
import { SchemaExtractor } from '@teambit/schema';
import { TsserverClient } from '@teambit/ts-server';
import { SchemaNode, APISchema, Module } from '@teambit/semantics.entities.semantic-schema';
import { Component } from '@teambit/component';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { flatten } from 'lodash';
import { TypescriptMain, SchemaTransformerSlot } from './typescript.main.runtime';
import { TransformerNotFound } from './exceptions';
import { SchemaExtractorContext } from './schema-extractor-context';
import { ExportList } from './export-list';

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
  async extract(component: Component): Promise<APISchema> {
    const tsserver = await this.getTsServer();
    const mainFile = component.mainFile;
    const mainAst = this.parseSourceFile(mainFile);
    const context = this.createContext(tsserver, component);
    const exportNames = await this.computeExportedIdentifiers(mainAst, context);
    context.setExports(new ExportList(exportNames));
    const moduleSchema = (await this.computeSchema(mainAst, context)) as Module;
    const allModules = moduleSchema.exports.filter((e) => e instanceof Module) as Module[];
    const allModulesExports = allModules.map((m) => m.exports);
    const nonModules = moduleSchema.exports.filter((e) => !(e instanceof Module));
    const flattened = [...nonModules, ...allModulesExports.flat()];
    const apiScheme = new Module(flattened);
    console.log('\n[*] apiScheme', flattened);

    // return APISchema.from({ });
    return new APISchema(apiScheme);
  }

  async computeExportedIdentifiers(node: Node, context: SchemaExtractorContext) {
    const transformer = this.getTransformer(node, context.component);
    if (!transformer || !transformer.getIdentifiers) throw new TransformerNotFound(node, context.component);
    return transformer.getIdentifiers(node, context);
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

  async computeSchema(node: Node, context: SchemaExtractorContext): Promise<SchemaNode> {
    const transformer = this.getTransformer(node, context.component);
    // if (!transformer) return undefined;
    return transformer.transform(node, context);
  }

  /**
   * select the correct transformer for a node.
   */
  private getTransformer(node: Node, component: Component) {
    const transformers = flatten(this.schemaTransformerSlot.values());
    const transformer = transformers.find((singleTransformer) => singleTransformer.predicate(node));

    if (!transformer) throw new TransformerNotFound(node, component);

    return transformer;
  }
}
