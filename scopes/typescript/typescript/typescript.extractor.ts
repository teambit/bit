
import ts, { Node, SourceFile, SyntaxKind } from 'typescript';
import { getTsconfig } from 'get-tsconfig';
import { SchemaExtractor } from '@teambit/schema';
import { TsserverClient } from '@teambit/ts-server';
import type { Workspace } from '@teambit/workspace';
import { ComponentDependency, DependencyResolverMain } from '@teambit/dependency-resolver';
import { SchemaNode, APISchema, ModuleSchema, UnImplementedSchema } from '@teambit/semantics.entities.semantic-schema';
import { Component } from '@teambit/component';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { EnvContext } from '@teambit/envs';
import { Formatter } from '@teambit/formatter';
import { Logger } from '@teambit/logger';
import pMapSeries from 'p-map-series';
import { flatten } from 'lodash';
import { TypescriptMain, SchemaTransformerSlot } from './typescript.main.runtime';
import { TransformerNotFound } from './exceptions';
import { SchemaExtractorContext } from './schema-extractor-context';
import { Identifier } from './identifier';
import { IdentifierList } from './identifier-list';
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
    private workspace: Workspace | undefined,
    private logger: Logger
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
    const compatibleExts = ['.tsx', '.jsx', '.ts', '.js'];
    const internalFiles = component.filesystem.files.filter(
      (file) => compatibleExts.includes(file.extname) && file.path !== mainFile.path
    );
    const allFiles = [mainFile, ...internalFiles];

    const context = await this.createContext(tsserver, component, formatter);

    await pMapSeries(allFiles, async (file) => {
      const ast = this.parseSourceFile(file);
      const identifiers = await this.computeIdentifiers(ast, context); // compute for every file
      const cacheKey = context.getIdentifierKeyForNode(ast);
      context.setIdentifiers(cacheKey, new IdentifierList(identifiers));
    });

    const mainAst = this.parseSourceFile(mainFile);
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

  async computeIdentifiers(node: Node, context: SchemaExtractorContext) {
    const transformer = this.getTransformer(node, context);
    let identifiers: Identifier[] = [];
    if (!transformer || !transformer.getIdentifiers) {
      this.logger.warn(new TransformerNotFound(node, context.component, context.getLocation(node)).toString());
    } else {
      identifiers = await transformer.getIdentifiers(node, context);
    }
    return identifiers;
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
    if (!transformer) {
      return new UnImplementedSchema(context.getLocation(node), node.getText(), SyntaxKind[node.kind]);
    }
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
    const transformer = transformers.find((singleTransformer) => {
      return singleTransformer.predicate(node);
    });
    if (!transformer) {
      this.logger.warn(new TransformerNotFound(node, context.component, context.getLocation(node)).toString());
      return undefined;
    }

    return transformer;
  }

  static from(options: ExtractorOptions) {
    return (context: EnvContext) => {
      const tsconfig = getTsconfig(options.tsconfig)?.config || { compilerOptions: options.compilerOptions };
      const tsMain = context.getAspect<TypescriptMain>(TypescriptAspect.id);
      // When loading the env from a scope you don't have a workspace
      const wsPath = tsMain.workspace?.path || '';
      return new TypeScriptExtractor(
        tsconfig,
        tsMain.schemaTransformerSlot,
        tsMain,
        wsPath,
        tsMain.depResolver,
        tsMain.workspace,
      );
    };
  }
}
