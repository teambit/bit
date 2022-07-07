import ts from 'typescript';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Compiler } from '@teambit/compiler';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { SchemaAspect, SchemaExtractor, SchemaMain } from '@teambit/schema';
import { PackageJsonProps } from '@teambit/pkg';
import { TypescriptConfigMutator } from '@teambit/typescript.modules.ts-config-mutator';
import { WorkspaceAspect } from '@teambit/workspace';
import type { WatchOptions, Workspace } from '@teambit/workspace';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import pMapSeries from 'p-map-series';
import { TsserverClient, TsserverClientOpts } from '@teambit/ts-server';
import AspectLoaderAspect, { AspectLoaderMain } from '@teambit/aspect-loader';
import type { Component } from '@teambit/component';
import { TypeScriptExtractor } from './typescript.extractor';
import { TypeScriptCompilerOptions } from './compiler-options';
import { TypescriptAspect } from './typescript.aspect';
import { TypescriptCompiler } from './typescript.compiler';
import { TypeScriptParser } from './typescript.parser';
import { SchemaTransformer } from './schema-transformer';
import { SchemaTransformerPlugin } from './schema-transformer.plugin';
import {
  ExportDeclaration,
  TypeAliasTransformer,
  FunctionDeclaration,
  VariableStatementTransformer,
  VariableDeclaration,
  SourceFileTransformer,
  ClassDecelerationTransformer,
  InterfaceDeclarationTransformer,
  EnumDeclarationTransformer,
  BindingElementTransformer,
} from './transformers';
import { CheckTypesCmd } from './cmds/check-types.cmd';

export type TsMode = 'build' | 'dev';

export type SchemaTransformerSlot = SlotRegistry<SchemaTransformer[]>;

export type TsConfigTransformContext = {
  // mode: TsMode;
};

export type TsConfigTransformer = (
  config: TypescriptConfigMutator,
  context: TsConfigTransformContext
) => TypescriptConfigMutator;

export class TypescriptMain {
  constructor(
    private logger: Logger,
    private schemaTransformerSlot: SchemaTransformerSlot,
    private workspace: Workspace,
    private depResolver: DependencyResolverMain
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
    return new TypescriptCompiler(TypescriptAspect.id, this.logger, afterMutation.raw, tsModule);
  }

  /**
   * get TsserverClient instance if initiated already, otherwise, return undefined.
   */
  getTsserverClient(): TsserverClient | undefined {
    return this.tsServer;
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
    this.tsServer.init();
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
      config.setModule('ES2020');
      return config;
    };
    return esmTransformer;
  }

  /**
   * create an instance of a typescript semantic schema extractor.
   */
  createSchemaExtractor(tsconfig: any, path?: string): SchemaExtractor {
    return new TypeScriptExtractor(
      tsconfig,
      this.schemaTransformerSlot,
      this,
      path || this.workspace.path,
      this.depResolver,
      this.workspace
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

  public getSupportedFilesForTsserver(components: Component[]): string[] {
    const files = components
      .map((c) => c.filesystem.files)
      .flat()
      .map((f) => f.path);
    return files.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
  }

  private async onPreWatch(components: Component[], watchOpts: WatchOptions) {
    const workspace = this.workspace;
    if (!workspace || !watchOpts.spawnTSServer) {
      return;
    }
    const { verbose, checkTypes } = watchOpts;
    const files = checkTypes ? this.getSupportedFilesForTsserver(components) : [];
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
  ];
  static slots = [Slot.withType<SchemaTransformer[]>()];

  static async provider(
    [schema, loggerExt, aspectLoader, workspace, cli, depResolver]: [
      SchemaMain,
      LoggerMain,
      AspectLoaderMain,
      Workspace,
      CLIMain,
      DependencyResolverMain
    ],
    config,
    [schemaTransformerSlot]: [SchemaTransformerSlot]
  ) {
    schema.registerParser(new TypeScriptParser());
    const logger = loggerExt.createLogger(TypescriptAspect.id);
    aspectLoader.registerPlugins([new SchemaTransformerPlugin(schemaTransformerSlot)]);
    const tsMain = new TypescriptMain(logger, schemaTransformerSlot, workspace, depResolver);
    schemaTransformerSlot.register([
      new ExportDeclaration(),
      new FunctionDeclaration(),
      new VariableStatementTransformer(),
      new VariableDeclaration(),
      new SourceFileTransformer(),
      new TypeAliasTransformer(),
      new ClassDecelerationTransformer(),
      new InterfaceDeclarationTransformer(),
      new EnumDeclarationTransformer(),
      new BindingElementTransformer(),
    ]);

    if (workspace) {
      workspace.registerOnPreWatch(tsMain.onPreWatch.bind(this));
      workspace.registerOnComponentChange(tsMain.onComponentChange.bind(this));
      workspace.registerOnComponentAdd(tsMain.onComponentChange.bind(this));
    }

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
