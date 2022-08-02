import * as path from 'path';
import fs from 'fs-extra';
import AspectLoaderAspect, { AspectLoaderMain } from '@teambit/aspect-loader';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { IssuesClasses } from '@teambit/component-issues';
import { Component, ComponentID } from '@teambit/component';
import { DEFAULT_DIST_DIRNAME } from '@teambit/legacy/dist/constants';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { BitId } from '@teambit/legacy-bit-id';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import ManyComponentsWriter from '@teambit/legacy/dist/consumer/component-ops/many-components-writer';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { GeneratorAspect, GeneratorMain } from '@teambit/generator';
import { PubsubAspect, PubsubMain } from '@teambit/pubsub';
import UIAspect, { UiMain } from '@teambit/ui';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { CompilerAspect } from './compiler.aspect';
import { CompileCmd } from './compiler.cmd';
import { CompilerService } from './compiler.service';
import { CompilerTask } from './compiler.task';
import { DistArtifact } from './dist-artifact';
import { DistArtifactNotFound } from './exceptions';
import { CompilationInitiator, Compiler } from './types';
import { CompileOptions, WorkspaceCompiler } from './workspace-compiler';
import { compilerTemplate } from './templates/compiler';

export class CompilerMain {
  constructor(
    private pubsub: PubsubMain,
    private workspaceCompiler: WorkspaceCompiler,
    private envs: EnvsMain,
    private builder: BuilderMain,
    private workspace: Workspace,
    private dependencyResolver: DependencyResolverMain
  ) {}

  /**
   * Run compilation on `bit new` and when new components are imported
   */
  compileOnWorkspace(
    componentsIds: string[] | BitId[] | ComponentID[] = [], // when empty, it compiles all
    options: CompileOptions = { initiator: CompilationInitiator.ComponentAdded }
  ) {
    return this.workspaceCompiler.compileComponents(componentsIds, options);
  }
  /**
   * API to create a new compiler task, it facilitates the usage of multiple compilers.
   * with this method you can create any number of compilers and add them to the buildPipeline.
   */
  createTask(name: string, compiler: Compiler): CompilerTask {
    return new CompilerTask(CompilerAspect.id, name, compiler, this.dependencyResolver);
  }

  /**
   * find the compiler configured on the workspace and ask for the dist path.
   */
  getDistPathBySrcPath(component: Component, srcPath: string): string | null {
    const environment = this.envs.getEnv(component).env;
    const compilerInstance = environment.getCompiler?.();
    if (!compilerInstance) return null;
    return compilerInstance.getDistPathBySrcPath(srcPath);
  }

  /**
   * find the compiler configured on the workspace and ask for the dist folder path.
   */
  getRelativeDistFolder(component: Component): string {
    const environment = this.envs.getOrCalculateEnv(component).env;
    const compilerInstance: Compiler | undefined = environment.getCompiler?.();
    if (!compilerInstance || !compilerInstance.getDistDir) return DEFAULT_DIST_DIRNAME;
    return compilerInstance.getDistDir();
  }

  /**
   * Check if the dist folder (in the component package under node_modules) exist
   * @param component
   * @returns
   */
  isDistDirExists(component: Component): boolean {
    const packageDir = this.workspace.getComponentPackagePath(component);
    const distDir = this.getRelativeDistFolder(component);
    const pathToCheck = path.join(packageDir, distDir);
    return fs.existsSync(pathToCheck);
  }

  async getDistsFiles(component: Component): Promise<DistArtifact> {
    const artifacts = await this.builder.getArtifactsVinylByExtension(component, CompilerAspect.id);
    if (!artifacts.length) throw new DistArtifactNotFound(component.id);

    return new DistArtifact(artifacts);
  }

  async addMissingDistsIssue(component: Component) {
    const exist = this.isDistDirExists(component);
    if (!exist) {
      component.state.issues.getOrCreate(IssuesClasses.MissingDists).data = true;
    }
    // we don't want to add any data to the compiler aspect, only to add issues on the component
    return undefined;
  }

  static runtime = MainRuntime;

  static dependencies = [
    CLIAspect,
    WorkspaceAspect,
    EnvsAspect,
    LoggerAspect,
    PubsubAspect,
    AspectLoaderAspect,
    BuilderAspect,
    UIAspect,
    GeneratorAspect,
    DependencyResolverAspect,
  ];

  static async provider([
    cli,
    workspace,
    envs,
    loggerMain,
    pubsub,
    aspectLoader,
    builder,
    ui,
    generator,
    dependencyResolver,
  ]: [
    CLIMain,
    Workspace,
    EnvsMain,
    LoggerMain,
    PubsubMain,
    AspectLoaderMain,
    BuilderMain,
    UiMain,
    GeneratorMain,
    DependencyResolverMain
  ]) {
    const logger = loggerMain.createLogger(CompilerAspect.id);
    const workspaceCompiler = new WorkspaceCompiler(
      workspace,
      envs,
      pubsub,
      aspectLoader,
      ui,
      logger,
      dependencyResolver
    );
    envs.registerService(new CompilerService());
    const compilerMain = new CompilerMain(pubsub, workspaceCompiler, envs, builder, workspace, dependencyResolver);
    cli.register(new CompileCmd(workspaceCompiler, logger, pubsub));
    if (workspace) {
      workspace.onComponentLoad(compilerMain.addMissingDistsIssue.bind(compilerMain));
    }
    generator.registerComponentTemplate([compilerTemplate]);
    ManyComponentsWriter.externalCompiler = compilerMain.compileOnWorkspace.bind(compilerMain);

    return compilerMain;
  }
}

CompilerAspect.addRuntime(CompilerMain);

export default CompilerMain;
