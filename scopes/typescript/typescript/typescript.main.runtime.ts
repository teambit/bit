import ts from 'typescript';
import { MainRuntime } from '@teambit/cli';
import { Compiler } from '@teambit/compiler';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { SchemaAspect, SchemaExtractor, SchemaMain } from '@teambit/schema';
import { PackageJsonProps } from '@teambit/pkg';
import { TypescriptConfigMutator } from '@teambit/typescript.modules.ts-config-mutator';
import WorkspaceAspect, { WatchOptions, Workspace } from '@teambit/workspace';
import EnvsAspect, { EnvsMain } from '@teambit/envs';
import { Component } from '@teambit/component';
import { TypeScriptExtractor } from './typescript.extractor';
import { TypeScriptCompilerOptions } from './compiler-options';
import { TypescriptAspect } from './typescript.aspect';
import { TypescriptCompiler } from './typescript.compiler';
import { TypeScriptParser } from './typescript.parser';
import { ComponentPrograms } from './component-programs';

export type TsMode = 'build' | 'dev';

export type TsConfigTransformContext = {
  // mode: TsMode;
};

export type TsConfigTransformer = (
  config: TypescriptConfigMutator,
  context: TsConfigTransformContext
) => TypescriptConfigMutator;

export class TypescriptMain {
  private componentPrograms: ComponentPrograms;
  constructor(private logger: Logger, private envs: EnvsMain, private workspace?: Workspace) {
    if (this.workspace) {
      this.workspace.registerOnPreWatch(this.onPreWatch.bind(this));
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
    await this.writeTsconfigAndTypesOnWorkspace(components);
    const componentPackageDirs = components.map((comp) => {
      const absPackageDir = workspace.componentPackageDir(comp);
      return { componentDir: absPackageDir, component: comp };
    });
    this.componentPrograms = new ComponentPrograms(componentPackageDirs);
    this.componentPrograms.startWatch(watchOpts);
  }

  private async writeTsconfigAndTypesOnWorkspace(components: Component[]) {
    const workspace = this.workspace;
    if (!workspace) return;
    const getTsCompiler = (component: Component): TypescriptCompiler | null => {
      const environment = this.envs.getEnv(component).env;
      const compilerInstance = environment.getCompiler();
      if (compilerInstance.id === TypescriptAspect.id) {
        return compilerInstance;
      }
      const tsCompilerOptions = environment.getTsCompilerOptions?.();
      if (tsCompilerOptions) {
        return this.createCompiler(tsCompilerOptions) as TypescriptCompiler;
      }
      this.logger.warn(
        `component "${component.id.toString()}" does not have any typescript configuration set, and won't be part of the check-types and schema-extraction mechanism`
      );
      return null;
    };
    await Promise.all(
      components.map(async (comp) => {
        const tsCompiler = getTsCompiler(comp);
        if (!tsCompiler) return;
        const compDir = workspace?.componentPackageDir(comp);
        await tsCompiler.writeTsConfigForWatch(compDir);
        await tsCompiler.writeTypes([compDir]);
      })
    );
  }

  /**
   * create an instance of a typescript semantic schema extractor.
   */
  createSchemaExtractor(): SchemaExtractor {
    return new TypeScriptExtractor(this.componentPrograms);
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
