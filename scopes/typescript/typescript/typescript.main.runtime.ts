import ts from 'typescript';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Compiler } from '@teambit/compiler';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { SchemaAspect, SchemaExtractor, SchemaMain } from '@teambit/schema';
import { PackageJsonProps } from '@teambit/pkg';
import { TypescriptConfigMutator } from '@teambit/typescript.modules.ts-config-mutator';
import { WorkspaceAspect } from '@teambit/workspace';
import type { Workspace } from '@teambit/workspace';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import pMapSeries from 'p-map-series';
import { TsserverClient, TsserverClientOpts } from '@teambit/ts-server';
import { TypescriptCompiler } from '@teambit/typescript.typescript-compiler';
import { AspectLoaderAspect, AspectLoaderMain } from '@teambit/aspect-loader';
import { WatcherAspect, WatcherMain, WatchOptions } from '@teambit/watcher';
import type { Component, ComponentID } from '@teambit/component';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { ScopeMain, ScopeAspect } from '@teambit/scope';
import { flatten } from 'lodash';
import { TypeScriptExtractor } from './typescript.extractor';
import { TypeScriptCompilerOptions } from './compiler-options';
import { TypescriptAspect } from './typescript.aspect';
import { TypeScriptParser } from './typescript.parser';
import { SchemaNodeTransformer, SchemaTransformer } from './schema-transformer';
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

export type SchemaTransformerSlot = SlotRegistry<SchemaTransformer[]>;
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

  registerSchemaTransformer(transformers: SchemaTransformer[]) {
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

  /**
   * create an instance of a typescript semantic schema extractor.
   */
  createSchemaExtractor(
    tsconfig: any,
    tsserverPath?: string,
    contextPath?: string,
    schemaTransformers: SchemaTransformer[] = [],
    apiTransformers: SchemaNodeTransformer[] = []
  ): SchemaExtractor {
    const schemaTransformersFromSlot = flatten(Array.from(this.schemaTransformerSlot.values()));
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
      this.logger
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
    tsMain.registerSchemaTransformer([
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
