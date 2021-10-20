import ts, { TsConfigSourceFile } from 'typescript';
import { MainRuntime } from '@teambit/cli';
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

  getTsserverClient(): TsserverClient | undefined {
    return this.tsServer;
  }

  async initTsserverClient(
    projectPath: string,
    components: Component[],
    options: TsserverClientOpts = {}
  ): Promise<TsserverClient> {
    const supportedFiles = this.getAllFilesForTsserver(components);
    this.tsServer = new TsserverClient(projectPath, supportedFiles, this.logger, options);
    this.tsServer.init();
    this.tsServer.openAllFiles();
    return this.tsServer;
  }

  async initTsserverClientFromWorkspace(
    components?: Component[],
    options: TsserverClientOpts = {}
  ): Promise<TsserverClient> {
    if (!this.workspace) {
      throw new Error(`initTsserverClientFromWorkspace: workspace was not found`);
    }
    if (!components) {
      components = await this.workspace.list();
    }
    return this.initTsserverClient(this.workspace.path, components, options);
  }

  private getAllFilesForTsserver(components: Component[]): string[] {
    const files = components
      .map((c) => c.filesystem.files)
      .flat()
      .map((f) => f.path);
    return files.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
  }

  private async onPreWatch(components: Component[], watchOpts: WatchOptions) {
    const workspace = this.workspace;
    if (!workspace || !watchOpts.checkTypes) {
      return;
    }
    await this.initTsserverClientFromWorkspace(components, { verbose: watchOpts.verbose });
    const start = Date.now();
    this.tsServer
      .getDiagnostic()
      .then(() => {
        const end = Date.now() - start;
        this.logger.console(`\ncompleted preliminary type checking. took ${end / 1000} sec`);
      })
      .catch((err) => {
        this.logger.error(`failed getting the diag info from ts-server`, err);
      });
  }

  private async onComponentChange(component: Component, files: string[]) {
    if (!this.tsServer) {
      return {
        results: 'N/A',
      };
    }
    await pMapSeries(files, (file) => this.tsServer.changed(file));
    let results = 'succeed';
    const start = Date.now();
    this.tsServer
      .getDiagnostic()
      .then(() => {
        const end = Date.now() - start;
        this.logger.console(
          `\ntype checking had been completed (${end / 1000} sec) for the following files:\n${files.join('\n')}`
        );
      })
      .catch((err) => {
        results = 'failed';
        this.logger.error(`failed getting the diag info from ts-server`, err);
      });
    return {
      results,
    };
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

  static runtime = MainRuntime;
  static dependencies = [SchemaAspect, LoggerAspect, WorkspaceAspect];

  static async provider([schema, loggerExt, workspace]: [SchemaMain, LoggerMain, Workspace]) {
    schema.registerParser(new TypeScriptParser());
    const logger = loggerExt.createLogger(TypescriptAspect.id);
    schema.registerParser(new TypeScriptParser(logger));

    return new TypescriptMain(logger, workspace);
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
