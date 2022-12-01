import ts, { Node, SourceFile } from 'typescript';
import { getTsconfig } from 'get-tsconfig';
import { SchemaExtractor } from '@teambit/schema';
import { TsserverClient } from '@teambit/ts-server';
import type { Workspace } from '@teambit/workspace';
import { ComponentDependency, DependencyResolverMain } from '@teambit/dependency-resolver';
import { SchemaNode, APISchema, ModuleSchema } from '@teambit/semantics.entities.semantic-schema';
import { Component } from '@teambit/component';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { EnvContext } from '@teambit/envs';
import { Formatter } from '@teambit/formatter';
import { flatten } from 'lodash';
import { TypescriptMain, SchemaTransformerSlot } from './typescript.main.runtime';
import { TransformerNotFound } from './exceptions';
import { SchemaExtractorContext } from './schema-extractor-context';
import { ExportList } from './export-list';
import { ExtractorOptions } from './extractor-options';
import { TypescriptAspect } from './typescript.aspect';

export class TypeScriptExtractor implements SchemaExtractor {
  constructor(
    private tsconfig: any,
    private schemaTransformerSlot: SchemaTransformerSlot,
    private tsMain: TypescriptMain,
    private rootPath: string,
    private depResolver: DependencyResolverMain,
    private workspace: Workspace | undefined
  ) {}

  parseSourceFile(file: AbstractVinyl): SourceFile {
    const sourceFile = ts.createSourceFile(
      file.path,
      file.contents.toString('utf8'),
      ts.ScriptTarget.Latest,
      true
      /** don't pass the scriptKind, it'll be determined automatically by typescript by the filepath */
    );
    // leave this commented out, it's helpful when there are issues with ASTs. consider throwing in this case.
    // console.log("sourceFile Errors", file.path, sourceFile.parseDiagnostics);
    return sourceFile;
  }

  /**
   * extract a component schema.
   */
  async extract(component: Component, formatter: Formatter): Promise<APISchema> {
    const tsserver = await this.getTsServer();
    const mainFile = component.mainFile;
    const mainAst = this.parseSourceFile(mainFile);
    const context = await this.createContext(tsserver, component, formatter);
    const exportNames = await this.computeExportedIdentifiers(mainAst, context);
    context.setExports(new ExportList(exportNames));
    const moduleSchema = (await this.computeSchema(mainAst, context)) as ModuleSchema;
    moduleSchema.flatExportsRecursively();
    const apiScheme = moduleSchema;
    const location = context.getLocation(mainAst);

    return new APISchema(location, apiScheme, component.id);
  }

  dispose() {
    if (!this.tsserver) return;
    this.tsserver.killTsServer();
  }

  async computeExportedIdentifiers(node: Node, context: SchemaExtractorContext) {
    const transformer = this.getTransformer(node, context);
    if (!transformer || !transformer.getIdentifiers) {
      throw new TransformerNotFound(node, context.component, context.getLocation(node));
    }
    return transformer.getIdentifiers(node, context);
  }

  private async createContext(
    tsserver: TsserverClient,
    component: Component,
    formatter: Formatter
  ): Promise<SchemaExtractorContext> {
    const componentDeps = await this.getComponentDeps(component);
    return new SchemaExtractorContext(tsserver, component, this, componentDeps, formatter);
  }

  private async getComponentDeps(component: Component): Promise<ComponentDependency[]> {
    const deps = await this.depResolver.getDependencies(component);
    const componentDeps = deps.getComponentDependencies();
    return componentDeps;
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
    const transformer = this.getTransformer(node, context);
    // leave the next line commented out, it is used for debugging
    // console.log('transformer', transformer.constructor.name, node.getText());
    return transformer.transform(node, context);
  }

  async getComponentIDByPath(file: string) {
    if (!this.workspace) {
      return null;
    }
    return this.workspace.getComponentIdByPath(file);
  }

  /**
   * select the correct transformer for a node.
   */
  private getTransformer(node: Node, context: SchemaExtractorContext) {
    const transformers = flatten(this.schemaTransformerSlot.values());
    const transformer = transformers.find((singleTransformer) => singleTransformer.predicate(node));

    if (!transformer) throw new TransformerNotFound(node, context.component, context.getLocation(node));

    return transformer;
  }

  static from(options: ExtractorOptions) {
    return (context: EnvContext) => {
      const tsconfig = getTsconfig(options.tsconfig)?.config || { compilerOptions: options.compilerOptions };
      const tsMain = context.getAspect<TypescriptMain>(TypescriptAspect.id);
      return new TypeScriptExtractor(
        tsconfig,
        tsMain.schemaTransformerSlot,
        tsMain,
        tsMain.workspace.path,
        tsMain.depResolver,
        tsMain.workspace,
      );
    };
  }
}
