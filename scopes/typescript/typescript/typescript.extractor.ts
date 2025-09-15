import type { Node, SourceFile } from 'typescript';
import ts, { SyntaxKind } from 'typescript';
import { getTsconfig } from 'get-tsconfig';
import type { SchemaExtractor, SchemaExtractorOptions } from '@teambit/schema';
import type { TsserverClient } from '@teambit/ts-server';
import type { Workspace } from '@teambit/workspace';
import type { ComponentDependency, DependencyResolverMain } from '@teambit/dependency-resolver';
import type { SchemaNode, ModuleSchema } from '@teambit/semantics.entities.semantic-schema';
import { APISchema, UnImplementedSchema, IgnoredSchema } from '@teambit/semantics.entities.semantic-schema';
import type { Component } from '@teambit/component';
import type { AbstractVinyl } from '@teambit/component.sources';
import type { EnvContext } from '@teambit/envs';
import type { Formatter } from '@teambit/formatter';
import type { Logger } from '@teambit/logger';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import { AspectLoaderAspect, getCoreAspectPackageName } from '@teambit/aspect-loader';
import type { ScopeMain } from '@teambit/scope';
import pMapSeries from 'p-map-series';
import { compact, flatten } from 'lodash';
import type { TypescriptMain } from './typescript.main.runtime';
import { TransformerNotFound } from './exceptions';
import { SchemaExtractorContext } from './schema-extractor-context';
import type { Identifier } from './identifier';
import { IdentifierList } from './identifier-list';
import type { ExtractorOptions } from './extractor-options';
import { TypescriptAspect } from './typescript.aspect';
import type { SchemaNodeTransformer, SchemaTransformer } from './schema-transformer';

export class TypeScriptExtractor implements SchemaExtractor {
  constructor(
    private tsconfig: any,
    private schemaTransformers: SchemaTransformer[],
    private apiTransformers: SchemaNodeTransformer[],
    private tsMain: TypescriptMain,
    private rootTsserverPath: string,
    private rootContextPath: string,
    private depResolver: DependencyResolverMain,
    private workspace: Workspace | undefined,
    private scope: ScopeMain,
    private aspectLoader: AspectLoaderMain,
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
  async extract(component: Component, options: SchemaExtractorOptions = {}): Promise<APISchema> {
    // override the rootTsserverPath and rootContextPath if passed via options
    if (options.tsserverPath) {
      this.rootTsserverPath = options.tsserverPath;
    }
    if (options.contextPath) {
      this.rootContextPath = options.contextPath;
    }
    const tsserver = await this.getTsServer();
    const mainFile = component.mainFile;
    const compatibleExts = ['.tsx', '.ts'];
    const internalFiles = options.skipInternals
      ? []
      : component.filesystem.files.filter(
          (file) => compatibleExts.includes(file.extname) && file.path !== mainFile.path
        );
    const allFiles = [mainFile, ...internalFiles];

    const context = await this.createContext(tsserver, component, options.formatter);

    await pMapSeries(allFiles, async (file) => {
      const ast = this.parseSourceFile(file);
      const identifiers = await this.computeIdentifiers(ast, context);
      const cacheKey = context.getIdentifierKeyForNode(ast);
      context.setIdentifiers(cacheKey, new IdentifierList(identifiers));
    });

    const mainAst = this.parseSourceFile(mainFile);
    const moduleSchema = (await this.computeSchema(mainAst, context)) as ModuleSchema;
    moduleSchema.flatExportsRecursively();
    const apiScheme = moduleSchema;
    const internals = await this.computeInternalModules(context, internalFiles);

    const location = context.getLocation(mainAst);

    return new APISchema(location, apiScheme, internals, component.id as any);
  }

  async computeInternalModules(context: SchemaExtractorContext, internalFiles: AbstractVinyl[]) {
    if (internalFiles.length === 0) return [];
    const internals = compact(
      await Promise.all(
        [...context.internalIdentifiers.entries()].map(async ([filePath]) => {
          const file = context.findFileInComponent(filePath);
          if (!file) return undefined;
          const fileAst = this.parseSourceFile(file);
          const moduleSchema = (await this.computeSchema(fileAst, context)) as ModuleSchema;
          moduleSchema.flatExportsRecursively();
          return moduleSchema;
        })
      )
    );
    return internals;
  }

  dispose() {
    if (!this.tsserver) return;
    this.tsserver.killTsServer();
  }

  async computeIdentifiers(node: Node, context: SchemaExtractorContext) {
    const transformer = this.getTransformer(node, context);
    let identifiers: Identifier[] = [];
    if (!transformer || !transformer.getIdentifiers) {
      this.logger.debug(new TransformerNotFound(node, context.component, context.getLocation(node)).toString());
    } else {
      identifiers = await transformer.getIdentifiers(node, context);
    }
    return identifiers;
  }

  private async createContext(
    tsserver: TsserverClient,
    component: Component,
    formatter?: Formatter
  ): Promise<SchemaExtractorContext> {
    const componentDeps = await this.getComponentDeps(component);
    return new SchemaExtractorContext(
      tsserver,
      component,
      this,
      componentDeps,
      this.rootContextPath,
      this.workspace?.path || this.scope.path,
      formatter
    );
  }

  private async getComponentDeps(component: Component): Promise<ComponentDependency[]> {
    const deps = this.depResolver.getDependencies(component);
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

      this.tsserver = await this.tsMain.initTsserverClient(this.rootTsserverPath);
      return this.tsserver;
    }

    return this.tsserver;
  }

  async computeSchema(node: Node, context: SchemaExtractorContext): Promise<SchemaNode> {
    const transformer = this.getTransformer(node, context);

    if (!transformer) {
      return new UnImplementedSchema(context.getLocation(node), node.getText(), SyntaxKind[node.kind]);
    }

    const schemaNode = await transformer.transform(node, context);

    return this.transformAPI(schemaNode, context);
  }

  async transformAPI(schema: SchemaNode, context: SchemaExtractorContext): Promise<SchemaNode> {
    const apiTransformer = this.getAPITransformer(schema);
    const transformedApi = apiTransformer ? await apiTransformer.transform(schema, context) : schema;
    if (!transformedApi) {
      return new IgnoredSchema(schema);
    }
    return transformedApi;
  }

  async getComponentIDByPath(file: string) {
    const coreAspectIds = this.aspectLoader.getCoreAspectIds();
    const matchingCoreAspect = coreAspectIds.find((c) => file === getCoreAspectPackageName(c));

    if (matchingCoreAspect) {
      return (this.workspace || this.scope).resolveComponentId(matchingCoreAspect);
    }

    if (this.workspace) {
      return this.workspace.getComponentIdByPath(file);
    }
    return null;
  }

  /**
   * select the correct transformer for a node.
   */
  getTransformer(node: Node, context: SchemaExtractorContext) {
    const transformer = this.schemaTransformers.find((singleTransformer) => {
      return singleTransformer.predicate(node);
    });
    if (!transformer) {
      this.logger.debug(new TransformerNotFound(node, context.component, context.getLocation(node)).toString());
      return undefined;
    }

    return transformer;
  }

  getAPITransformer(node: SchemaNode) {
    const transformer = this.apiTransformers.find((singleTransformer) => {
      return singleTransformer.predicate(node);
    });
    if (!transformer) {
      return undefined;
    }

    return transformer;
  }

  static from(options: ExtractorOptions) {
    return (context: EnvContext) => {
      const tsconfig = getTsconfig(options.tsconfig)?.config || { compilerOptions: options.compilerOptions };
      const tsMain = context.getAspect<TypescriptMain>(TypescriptAspect.id);
      const aspectLoaderMain = context.getAspect<AspectLoaderMain>(AspectLoaderAspect.id);
      // When loading the env from a scope you don't have a workspace
      const rootPath = tsMain.workspace?.path || tsMain.scope.path || '';

      const schemaTransformersFromOptions = options.schemaTransformers || [];
      const schemaTransformersFromAspect = tsMain.getAllTransformers();

      const apiTransformersFromOptions = options.apiTransformers || [];
      const apiTransformersFromAspect = flatten(Array.from(tsMain.apiTransformerSlot.values()));

      const schemaTransformers = [...schemaTransformersFromOptions, ...schemaTransformersFromAspect];
      const apiTransformers = [...apiTransformersFromOptions, ...apiTransformersFromAspect];

      return new TypeScriptExtractor(
        tsconfig,
        schemaTransformers,
        apiTransformers,
        tsMain,
        rootPath,
        rootPath,
        tsMain.depResolver,
        tsMain.workspace,
        tsMain.scope,
        aspectLoaderMain,
        context.createLogger(options.name)
      );
    };
  }
}
