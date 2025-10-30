import type { Node, SourceFile } from 'typescript';
import ts, { SyntaxKind } from 'typescript';
import { getTsconfig } from 'get-tsconfig';
import type { SchemaExtractor, SchemaExtractorOptions } from '@teambit/schema';
import type { TsserverClient } from '@teambit/ts-server';
import type { Workspace } from '@teambit/workspace';
import type { ComponentDependency, DependencyResolverMain } from '@teambit/dependency-resolver';
import type { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import {
  APISchema,
  UnImplementedSchema,
  IgnoredSchema,
  ModuleSchema,
} from '@teambit/semantics.entities.semantic-schema';
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
import minimatch from 'minimatch';
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
    private logger: Logger,
    private includeFiles: string[] = []
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
    if (options.includeFiles) {
      this.includeFiles = options.includeFiles;
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
    const internalModules = await this.computeInternalModules(context);
    const includedFiles = this.resolveIncludedFiles(component, this.includeFiles ?? []);

    const includedModules = compact(
      await Promise.all(
        includedFiles.map(async (file) => {
          const ast = this.parseSourceFile(file);
          const schema = (await this.computeSchema(ast, context)) as ModuleSchema;
          schema.flatExportsRecursively();
          return schema;
        })
      )
    );

    const interalAndIncludedModules = includedModules.concat(internalModules);
    const location = context.getLocation(mainAst);

    return new APISchema(location, apiScheme, interalAndIncludedModules, component.id as any);
  }

  async computeInternalModules(context: SchemaExtractorContext) {
    if (context.internalIdentifiers.size === 0) return [];

    const modules = await Promise.all(
      [...context.internalIdentifiers.entries()].map(async ([fileKey, idList]) => {
        const file = context.findFileInComponent(fileKey);
        if (!file) return undefined;

        const parsedSourceFile = this.parseSourceFile(file);

        const nameIndex = context.buildTopLevelNameIndex(parsedSourceFile);

        const internalSchemas = await Promise.all(
          idList.identifiers.map(async (identifier) => {
            const decl = nameIndex.get(identifier.id);
            if (!decl) return undefined;
            return context.computeSchema(decl);
          })
        );

        const filtered = compact(internalSchemas);
        if (!filtered.length) return undefined;

        return new ModuleSchema(context.getLocation(parsedSourceFile), [], filtered);
      })
    );

    return compact(modules);
  }

  private normalizePath(p: string): string {
    return p.replace(/\\/g, '/').replace(/^\.?\//, '');
  }

  private fileRelativePath(file: AbstractVinyl, component: Component): string {
    const base = component.filesystem.files[0].base;
    return this.normalizePath(file.path.slice(base.length).replace(/^\/+/, ''));
  }

  private matchGlob(input: string, pattern: string): boolean {
    const hasGlobMeta = /[*?[\]{},]/.test(pattern);
    if (!hasGlobMeta) return input === pattern;
    return minimatch(input, pattern, { dot: true });
  }

  private resolveIncludedFiles(component: Component, includes: string[] = []): AbstractVinyl[] {
    if (!includes.length) return [];

    const normalizedIncludedPaths = includes.map(this.normalizePath);

    return component.filesystem.files.filter((file) => {
      const rel = this.fileRelativePath(file, component);
      if (!(rel.endsWith('.ts') || rel.endsWith('.tsx'))) return false;

      return normalizedIncludedPaths.some((pattern) => this.matchGlob(rel, pattern));
    });
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
        context.createLogger(options.name),
        options.includeFiles
      );
    };
  }
}
