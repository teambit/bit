import ts, { TsConfigSourceFile } from 'typescript';
import { MainRuntime } from '@teambit/cli';
import { Compiler } from '@teambit/compiler';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { SchemaAspect, SchemaExtractor, SchemaMain } from '@teambit/schema';
import { PackageJsonProps } from '@teambit/pkg';
import { TypescriptConfigMutator } from '@teambit/typescript.modules.ts-config-mutator';
import WorkspaceAspect, { WatchOptions, Workspace } from '@teambit/workspace';
import pMapSeries from 'p-map-series';
import EnvsAspect, { EnvsMain } from '@teambit/envs';
import { TsserverClient } from '@teambit/ts-server';
import { Component } from '@teambit/component';
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
  constructor(private logger: Logger, private envs: EnvsMain, private workspace?: Workspace) {
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

  private async onPreWatch(components: Component[], watchOpts: WatchOptions) {
    const workspace = this.workspace;
    if (!workspace || !watchOpts.checkTypes) {
      return;
    }
    // get all files paths
    const files = components
      .map((c) => c.filesystem.files)
      .flat()
      .map((f) => f.path);
    const supportedFiles = files.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));

    this.tsServer = new TsserverClient(workspace.path, supportedFiles, {
      logger: this.logger,
      verbose: watchOpts.verbose,
    });
    this.tsServer.init();
    this.tsServer.openAllFiles();

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

  async onComponentChange(component: Component, files: string[]) {
    await pMapSeries(files, (file) => this.tsServer.changed(file));
    let results = 'succeed';
    this.tsServer
      .getDiagnostic()
      .then(() => {
        this.logger.console(`\ntype checking had been completed for the following files:\n${files.join('\n')}`);
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
  static dependencies = [SchemaAspect, LoggerAspect, EnvsAspect, WorkspaceAspect];

  static async provider([schema, loggerExt, envs, workspace]: [SchemaMain, LoggerMain, EnvsMain, Workspace]) {
    schema.registerParser(new TypeScriptParser());
    const logger = loggerExt.createLogger(TypescriptAspect.id);
    schema.registerParser(new TypeScriptParser(logger));

    return new TypescriptMain(logger, envs, workspace);
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
