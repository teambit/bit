import ts from 'typescript';
import path from 'path';
import type { SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import type { Compiler } from '@teambit/compiler';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { SchemaExtractor, SchemaMain } from '@teambit/schema';
import { SchemaAspect } from '@teambit/schema';
import type { PackageJsonProps } from '@teambit/pkg';
import { TypescriptConfigMutator } from '@teambit/typescript.modules.ts-config-mutator';
import { WorkspaceAspect } from '@teambit/workspace';
import type { Workspace } from '@teambit/workspace';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import pMapSeries from 'p-map-series';
import type { TsserverClientOpts, DiagnosticData } from '@teambit/ts-server';
import { TsserverClient, formatDiagnostic } from '@teambit/ts-server';
import { TypescriptCompiler } from '@teambit/typescript.typescript-compiler';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import { AspectLoaderAspect } from '@teambit/aspect-loader';
import type { WatcherMain, WatchOptions } from '@teambit/watcher';
import { WatcherAspect } from '@teambit/watcher';
import type { Component, ComponentID } from '@teambit/component';
import type { BuilderMain } from '@teambit/builder';
import { BuilderAspect } from '@teambit/builder';
import type { EnvsMain } from '@teambit/envs';
import { EnvsAspect } from '@teambit/envs';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import { flatten } from 'lodash';
import { TypeScriptExtractor } from './typescript.extractor';
import type { TypeScriptCompilerOptions } from './compiler-options';
import { TypescriptAspect } from './typescript.aspect';
import { TypeScriptParser } from './typescript.parser';
import type { SchemaNodeTransformer, SchemaTransformer } from './schema-transformer';
import { SchemaTransformerPlugin } from './schema-transformer.plugin';
import {
  ExportDeclarationTransformer,
  TypeAliasTransformer,
  FunctionLikeTransformer,
  SetAccessorTransformer,
  GetAccessorTransformer,
  IndexSignatureTransformer,
  PropertyDeclarationTransformer,
  ParameterTransformer,
  VariableStatementTransformer,
  VariableDeclaration,
  SourceFileTransformer,
  ClassDeclarationTransformer,
  InterfaceDeclarationTransformer,
  EnumDeclarationTransformer,
  BindingElementTransformer,
  ExportAssignmentTransformer,
  ImportDeclarationTransformer,
  IntersectionTypeTransformer,
  UnionTypeTransformer,
  TypeReferenceTransformer,
  TypeLiteralTransformer,
  LiteralTypeTransformer,
  TypeQueryTransformer,
  ArrayTypeTransformer,
  TypeOperatorTransformer,
  KeywordTypeTransformer,
  TupleTypeTransformer,
  ParenthesizedTypeTransformer,
  TypePredicateTransformer,
  IndexedAccessTypeTransformer,
  TemplateLiteralTypeSpanTransformer,
  TemplateLiteralTypeTransformer,
  ThisTypeTransformer,
  ConditionalTypeTransformer,
  NamedTupleTransformer,
  ConstructorTransformer,
  ExpressionStatementTransformer,
  ModuleDeclarationTransformer,
  ObjectLiteralExpressionTransformer,
  ArrayLiteralExpressionTransformer,
  PropertyAssignmentTransformer,
  DecoratorTransformer,
  LiteralValueTransformer,
} from './transformers';
import { CheckTypesCmd } from './cmds/check-types.cmd';
import { RemoveTypesTask } from './remove-types-task';

export type TsMode = 'build' | 'dev';

export type SchemaTransformerSlot = SlotRegistry<() => SchemaTransformer[]>;
export type APITransformerSlot = SlotRegistry<SchemaNodeTransformer[]>;

export type TsConfigTransformContext = {
  // mode: TsMode;
};

export type TsconfigWriterOptions = {
  clean?: boolean;
  silent?: boolean; // no prompt
  dedupe?: boolean;
  dryRun?: boolean;
  dryRunWithTsconfig?: boolean;
};

export type TsConfigTransformer = (
  config: TypescriptConfigMutator,
  context: TsConfigTransformContext
) => TypescriptConfigMutator;

export class TypescriptMain {
  constructor(
    private logger: Logger,
    readonly schemaTransformerSlot: SchemaTransformerSlot,
    readonly apiTransformerSlot: APITransformerSlot,
    readonly workspace: Workspace,
    readonly scope: ScopeMain,
    readonly depResolver: DependencyResolverMain,
    private envs: EnvsMain,
    private aspectLoader: AspectLoaderMain
  ) {}

  private tsServer: TsserverClient;
  /**
   * create a new compiler.
   */
  createCompiler(
    options: TypeScriptCompilerOptions,
    transformers: TsConfigTransformer[] = [],
    tsModule = ts
  ): Compiler {
    const configMutator = new TypescriptConfigMutator(options);
    const transformerContext: TsConfigTransformContext = {};
    const afterMutation = runTransformersWithContext(configMutator.clone(), transformers, transformerContext);
    const afterMutationWithoutTsconfig = { ...afterMutation.raw, tsconfig: '' };

    return new TypescriptCompiler(
      TypescriptAspect.id,
      this.logger,
      afterMutationWithoutTsconfig,
      afterMutation.raw.tsconfig,
      tsModule as any
    );
  }

  /**
   * get TsserverClient instance if initiated already, otherwise, return undefined.
   */
  getTsserverClient(): TsserverClient | undefined {
    return this.tsServer;
  }

  registerSchemaTransformer(transformers: () => SchemaTransformer[]) {
    this.schemaTransformerSlot.register(transformers);
    return this;
  }

  registerApiTransformer(transformers: SchemaNodeTransformer[]) {
    this.apiTransformerSlot.register(transformers);
    return this;
  }

  /**
   * starts a tsserver process to communicate with its API.
   * @param projectPath absolute path of the project root directory
   * @param options TsserverClientOpts
   * @param files optionally, if check-types is enabled, provide files to open and type check.
   * @returns TsserverClient
   */
  async initTsserverClient(
    projectPath: string,
    options: TsserverClientOpts = {},
    files: string[] = []
  ): Promise<TsserverClient> {
    this.tsServer = new TsserverClient(projectPath, this.logger, options, files);
    await this.tsServer.init();
    return this.tsServer;
  }

  /**
   * starts a tsserver process to communicate with its API. use only when running on the workspace.
   * @param options TsserverClientOpts
   * @param files optionally, if check-types is enabled, provide files to open and type check.
   * @returns TsserverClient
   */
  async initTsserverClientFromWorkspace(
    options: TsserverClientOpts = {},
    files: string[] = []
  ): Promise<TsserverClient> {
    if (!this.workspace) {
      throw new Error(`initTsserverClientFromWorkspace: workspace was not found`);
    }
    return this.initTsserverClient(this.workspace.path, options, files);
  }

  /**
   * Create a compiler instance and run the cjs transformer for it
   * @param options
   * @param transformers
   * @param tsModule
   * @returns
   */
  createCjsCompiler(options: TypeScriptCompilerOptions, transformers: TsConfigTransformer[] = [], tsModule = ts) {
    return this.createCompiler(options, [this.getCjsTransformer(), ...transformers], tsModule);
  }

  /**
   * Create a compiler instance and run the esm transformer for it
   * @param options
   * @param transformers
   * @param tsModule
   * @returns
   */
  createEsmCompiler(options: TypeScriptCompilerOptions, transformers: TsConfigTransformer[] = [], tsModule = ts) {
    return this.createCompiler(options, [this.getEsmTransformer(), ...transformers], tsModule);
  }

  /**
   * Create a transformer that change the ts module to CommonJS
   * @returns
   */
  getCjsTransformer(): TsConfigTransformer {
    const cjsTransformer = (config: TypescriptConfigMutator) => {
      config.setModule('CommonJS');
      return config;
    };
    return cjsTransformer;
  }

  /**
   * Create a transformer that change the ts module to ES2020
   * @returns
   */
  getEsmTransformer(): TsConfigTransformer {
    const esmTransformer = (config: TypescriptConfigMutator) => {
      config.setTarget('ES2017');
      config.raw.tsconfig.compilerOptions.module = 'es2020';
      config.raw.tsconfig.compilerOptions.lib = ['es2021', 'dom', 'ESNext.String', 'dom.Iterable'];
      return config;
    };
    return esmTransformer;
  }

  getAllTransformers(): SchemaTransformer[] {
    const transformersFunc = Array.from(this.schemaTransformerSlot.values());
    // backward compatibility for transformers that are not wrapped with a function (bit < 1.9.80)
    return transformersFunc.map((transformer) => (Array.isArray(transformer) ? transformer : transformer())).flat();
  }

  /**
   * create an instance of a typescript semantic schema extractor.
   */
  createSchemaExtractor(
    tsconfig: any,
    tsserverPath?: string,
    contextPath?: string,
    schemaTransformers: SchemaTransformer[] = [],
    apiTransformers: SchemaNodeTransformer[] = [],
    includeFiles: string[] = []
  ): SchemaExtractor {
    const schemaTransformersFromSlot = this.getAllTransformers();
    const apiTransformersFromSlot = flatten(Array.from(this.apiTransformerSlot.values()));

    const allSchemaTransformers = schemaTransformers.concat(schemaTransformersFromSlot);
    const allApiTransformers = apiTransformers.concat(apiTransformersFromSlot);

    return new TypeScriptExtractor(
      tsconfig,
      allSchemaTransformers,
      allApiTransformers,
      this,
      tsserverPath || this.workspace?.path || '',
      contextPath || this.workspace?.path || '',
      this.depResolver,
      this.workspace,
      this.scope,
      this.aspectLoader,
      this.logger,
      includeFiles
    );
  }

  /**
   * add the default package json properties to the component
   * :TODO @gilad why do we need this DSL? can't I just get the args here.
   */
  getCjsPackageJsonProps(): PackageJsonProps {
    return {
      main: 'dist/{main}.js',
      types: '{main}.ts',
    };
  }

  /**
   * add type: module to the package.json props and the default props
   * :TODO @gilad why do we need this DSL? can't I just get the args here.
   */
  getEsmPackageJsonProps(): PackageJsonProps {
    return {
      // main: 'dist-esm/{main}.js',
      main: 'dist/{main}.js',
      type: 'module',
      types: '{main}.ts',
    };
  }

  getSupportedFilesForTsserver(components: Component[]): string[] {
    const files = components
      .map((c) => c.filesystem.files)
      .flat()
      .map((f) => f.path);
    return files.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
  }

  /**
   * Groups components by environment and returns a map of envId to component files.
   */
  groupComponentsByEnv(components: Component[]): Map<string, { components: Component[]; files: string[] }> {
    const envMap = new Map<string, { components: Component[]; files: string[] }>();

    for (const component of components) {
      const envId = this.envs.getEnvId(component).toString();
      if (!envMap.has(envId)) {
        envMap.set(envId, { components: [], files: [] });
      }
      const entry = envMap.get(envId)!;
      entry.components.push(component);
      const compFiles = this.getSupportedFilesForTsserver([component]);
      entry.files.push(...compFiles);
    }

    return envMap;
  }

  /**
   * Check types for components, creating separate tsserver instances per environment.
   * This ensures each environment uses its own tsconfig settings (e.g., strictNullChecks).
   * Runs all tsserver instances in parallel for better performance.
   */
  async checkTypesPerEnvironment(
    components: Component[],
    options: TsserverClientOpts = {}
  ): Promise<{ tsservers: TsserverClient[]; diagnosticData: DiagnosticData[]; totalDiagnostics: number }> {
    if (!this.workspace) {
      throw new Error('checkTypesPerEnvironment: workspace was not found');
    }

    const envGroups = this.groupComponentsByEnv(components);

    // Create and run all tsserver instances in parallel
    // Always aggregate data to enable deduplication, disable per-tsserver printing
    const envEntries = Array.from(envGroups.entries()).filter(([, { files }]) => files.length > 0);

    const tsservers: TsserverClient[] = [];
    let results: Array<{ tsserver: TsserverClient; files: Set<string>; componentDir: string }>;

    try {
      results = await Promise.all(
        envEntries.map(async ([envId, { components: envComponents, files }]) => {
          const firstComponent = envComponents[0];
          const componentDir = this.workspace!.componentDir(firstComponent.id, { ignoreVersion: true });

          this.logger.debug(
            `Creating tsserver for env ${envId} with projectRootPath: ${componentDir}, files: ${files.length}`
          );

          const tsserverOpts = { ...options, printTypeErrors: false, aggregateDiagnosticData: true };
          const tsserver = new TsserverClient(componentDir, this.logger, tsserverOpts, files);
          tsservers.push(tsserver); // Track for cleanup on error
          await tsserver.init();
          await tsserver.getDiagnostic(files);

          return { tsserver, files: new Set(files), componentDir };
        })
      );
    } catch (err) {
      // Clean up any created tsserver instances on error
      this.killTsservers(tsservers);
      throw err;
    }

    // Deduplicate diagnostics - only include errors from files that belong to this env's components
    // This prevents the same error from appearing multiple times when a file is imported across envs
    const seenDiagnosticKeys = new Set<string>();
    const filesWithDiagnostics = new Set<string>();
    const allDiagnosticData: DiagnosticData[] = [];

    for (const { tsserver, files: envFiles, componentDir } of results) {
      for (const data of tsserver.diagnosticData) {
        const fullPath = path.resolve(componentDir, data.file);
        if (!envFiles.has(fullPath)) continue;

        const diagnosticKey = `${fullPath}:${data.diagnostic.start?.line}:${data.diagnostic.start?.offset}:${data.diagnostic.text}`;
        if (seenDiagnosticKeys.has(diagnosticKey)) continue;
        seenDiagnosticKeys.add(diagnosticKey);

        filesWithDiagnostics.add(fullPath);
        const wsRelativePath = path.relative(this.workspace!.path, fullPath);
        const formatted = formatDiagnostic(data.diagnostic, wsRelativePath);
        allDiagnosticData.push({ ...data, file: wsRelativePath, formatted });

        if (options.printTypeErrors) {
          this.logger.console(formatted);
        }
      }
    }

    return { tsservers, diagnosticData: allDiagnosticData, totalDiagnostics: filesWithDiagnostics.size };
  }

  /**
   * Kill all tsserver instances from checkTypesPerEnvironment.
   */
  killTsservers(tsservers: TsserverClient[]) {
    for (const tsserver of tsservers) {
      tsserver.killTsServer();
    }
  }

  private async onPreWatch(componentIds: ComponentID[], watchOpts: WatchOptions) {
    const workspace = this.workspace;
    if (!workspace || !watchOpts.spawnTSServer) {
      return;
    }
    const { verbose, checkTypes } = watchOpts;
    const files = checkTypes ? this.getSupportedFilesForTsserver(await workspace.getMany(componentIds)) : [];
    const printTypeErrors = Boolean(checkTypes);
    await this.initTsserverClientFromWorkspace({ verbose, checkTypes, printTypeErrors }, files);
  }

  private async onComponentChange(component: Component, files: string[]) {
    if (!this.tsServer) {
      return {
        results: 'N/A',
      };
    }
    await pMapSeries(files, (file) => this.tsServer.onFileChange(file));
    return {
      results: 'succeed',
    };
  }

  static runtime = MainRuntime;
  static dependencies = [
    SchemaAspect,
    LoggerAspect,
    AspectLoaderAspect,
    WorkspaceAspect,
    CLIAspect,
    DependencyResolverAspect,
    EnvsAspect,
    WatcherAspect,
    ScopeAspect,
    BuilderAspect,
  ];
  static slots = [Slot.withType<SchemaTransformer[]>(), Slot.withType<SchemaNodeTransformer[]>()];

  static async provider(
    [schema, loggerExt, aspectLoader, workspace, cli, depResolver, envs, watcher, scope, builder]: [
      SchemaMain,
      LoggerMain,
      AspectLoaderMain,
      Workspace,
      CLIMain,
      DependencyResolverMain,
      EnvsMain,
      WatcherMain,
      ScopeMain,
      BuilderMain,
    ],
    config,
    [schemaTransformerSlot, apiTransformerSlot]: [SchemaTransformerSlot, APITransformerSlot]
  ) {
    schema.registerParser(new TypeScriptParser());
    const logger = loggerExt.createLogger(TypescriptAspect.id);

    aspectLoader.registerPlugins([new SchemaTransformerPlugin(schemaTransformerSlot)]);
    const tsMain = new TypescriptMain(
      logger,
      schemaTransformerSlot,
      apiTransformerSlot,
      workspace,
      scope,
      depResolver,
      envs,
      aspectLoader
    );
    tsMain.registerSchemaTransformer(() => [
      new ExportDeclarationTransformer(),
      new ExportAssignmentTransformer(),
      new FunctionLikeTransformer(),
      new ParameterTransformer(),
      new SetAccessorTransformer(),
      new GetAccessorTransformer(),
      new IndexSignatureTransformer(),
      new PropertyDeclarationTransformer(),
      new VariableStatementTransformer(),
      new VariableDeclaration(),
      new SourceFileTransformer(),
      new TypeAliasTransformer(),
      new ClassDeclarationTransformer(),
      new InterfaceDeclarationTransformer(),
      new EnumDeclarationTransformer(),
      new BindingElementTransformer(),
      new IntersectionTypeTransformer(),
      new UnionTypeTransformer(),
      new TypeReferenceTransformer(),
      new TypeLiteralTransformer(),
      new LiteralTypeTransformer(),
      new TypeQueryTransformer(),
      new ArrayTypeTransformer(),
      new TypeOperatorTransformer(),
      new KeywordTypeTransformer(),
      new TupleTypeTransformer(),
      new ParenthesizedTypeTransformer(),
      new TypePredicateTransformer(),
      new IndexedAccessTypeTransformer(),
      new TemplateLiteralTypeSpanTransformer(),
      new TemplateLiteralTypeTransformer(),
      new ThisTypeTransformer(),
      new ConditionalTypeTransformer(),
      new NamedTupleTransformer(),
      new ConstructorTransformer(),
      new ImportDeclarationTransformer(),
      new ExpressionStatementTransformer(),
      new ModuleDeclarationTransformer(),
      new DecoratorTransformer(),
      new ObjectLiteralExpressionTransformer(),
      new ArrayLiteralExpressionTransformer(),
      new PropertyAssignmentTransformer(),
      new LiteralValueTransformer(),
    ]);

    if (workspace) {
      watcher.registerOnPreWatch(tsMain.onPreWatch.bind(tsMain));
      workspace.registerOnComponentChange(tsMain.onComponentChange.bind(tsMain));
      workspace.registerOnComponentAdd(tsMain.onComponentChange.bind(tsMain));
    }

    const removeTypesTask = new RemoveTypesTask();
    builder.registerSnapTasks([removeTypesTask]);
    builder.registerTagTasks([removeTypesTask]);

    const checkTypesCmd = new CheckTypesCmd(tsMain, workspace, logger);
    cli.register(checkTypesCmd);

    return tsMain;
  }
}

TypescriptAspect.addRuntime(TypescriptMain);

export function runTransformersWithContext(
  config: TypescriptConfigMutator,
  transformers: TsConfigTransformer[] = [],
  context: TsConfigTransformContext
): TypescriptConfigMutator {
  if (!Array.isArray(transformers)) return config;
  const newConfig = transformers.reduce((acc, transformer) => {
    return transformer(acc, context);
  }, config);
  return newConfig;
}

export default TypescriptMain;
