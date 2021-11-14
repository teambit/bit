import ts, { TsConfigSourceFile } from 'typescript';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Compiler } from '@teambit/compiler';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { SchemaAspect, SchemaExtractor, SchemaMain } from '@teambit/schema';
import { PackageJsonProps } from '@teambit/pkg';
import { TypescriptConfigMutator } from '@teambit/typescript.modules.ts-config-mutator';
import WorkspaceAspect from '@teambit/workspace';
import type { WatchOptions, Workspace } from '@teambit/workspace';
import pMapSeries from 'p-map-series';
import { TsserverClient, TsserverClientOpts } from '@teambit/ts-server';
import type { Component } from '@teambit/component';
import { TypeScriptExtractor } from './typescript.extractor';
import { TypeScriptCompilerOptions } from './compiler-options';
import { TypescriptAspect } from './typescript.aspect';
import { TypescriptCompiler } from './typescript.compiler';
import { TypeScriptParser } from './typescript.parser';
import { CheckTypesCmd } from './cmds/check-types.cmd';

export type TsMode = 'build' | 'dev';

export type TsConfigTransformContext = {
  // mode: TsMode;
};

export type TsConfigTransformer = (
  config: TypescriptConfigMutator,
  context: TsConfigTransformContext
) => TypescriptConfigMutator;

export class TypescriptMain {
  private tsServer: TsserverClient;
  constructor(private logger: Logger, private workspace?: Workspace) {
    if (this.workspace) {
      this.workspace.registerOnPreWatch(this.onPreWatch.bind(this));
      this.workspace.registerOnComponentChange(this.onComponentChange.bind(this));
      this.workspace.registerOnComponentAdd(this.onComponentChange.bind(this));
    }
  }
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
   * create an instance of a typescript semantic schema extractor.
   */
  createSchemaExtractor(tsconfig: TsConfigSourceFile): SchemaExtractor {
    return new TypeScriptExtractor(tsconfig);
  }

  /**
   * add the default package json properties to the component
   * :TODO @gilad why do we need this DSL? can't I just get the args here.
   */
  getPackageJsonProps(): PackageJsonProps {
    return {
      main: 'dist/{main}.js',
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
  static dependencies = [SchemaAspect, LoggerAspect, WorkspaceAspect, CLIAspect];

  static async provider([schema, loggerExt, workspace, cli]: [SchemaMain, LoggerMain, Workspace, CLIMain]) {
    schema.registerParser(new TypeScriptParser());
    const logger = loggerExt.createLogger(TypescriptAspect.id);
    schema.registerParser(new TypeScriptParser(logger));
    const typescriptMain = new TypescriptMain(logger, workspace);
    const checkTypesCmd = new CheckTypesCmd(typescriptMain, workspace, logger);
    cli.register(checkTypesCmd);

    return typescriptMain;
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
