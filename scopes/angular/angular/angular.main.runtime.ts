import { MainRuntime } from '@teambit/cli';
import { GeneratorAspect, GeneratorMain } from '@teambit/generator';
import { ESLintAspect, ESLintMain } from '@teambit/eslint';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { JestAspect, JestMain } from '@teambit/jest';
import { ApplicationAspect, ApplicationMain } from '@teambit/application';
import { PkgAspect, PkgMain } from '@teambit/pkg';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { TypescriptAspect, TypescriptMain } from '@teambit/typescript';
import { WebpackAspect, WebpackMain } from '@teambit/webpack';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import TesterAspect, { TesterMain } from '@teambit/tester';
import { NgPackagrAspect, NgPackagrMain } from '@teambit/ng-packagr';
import { AngularAspect } from './angular.aspect';
import { AngularEnv } from './angular.env';
import { componentTemplates } from './angular.templates';

type AngularDeps = [
  EnvsMain,
  JestMain,
  TypescriptMain,
  CompilerMain,
  WebpackMain,
  Workspace,
  PkgMain,
  TesterMain,
  ESLintMain,
  ApplicationMain,
  GeneratorMain,
  NgPackagrMain
];

export class AngularMain {
  static slots = [];
  static dependencies = [
    EnvsAspect,
    JestAspect,
    TypescriptAspect,
    CompilerAspect,
    WebpackAspect,
    WorkspaceAspect,
    PkgAspect,
    TesterAspect,
    ESLintAspect,
    ApplicationAspect,
    GeneratorAspect,
    NgPackagrAspect,
  ];
  static runtime = MainRuntime;

  constructor(
    /**
     * an instance of the Angular env.
     */
    readonly angularEnv: AngularEnv,

    private envs: EnvsMain,

    private application: ApplicationMain,

    private workspace: Workspace
  ) {}

  static async provider([
    envs,
    jestAspect,
    tsAspect,
    compiler,
    webpack,
    workspace,
    pkg,
    tester,
    eslint,
    application,
    generator,
    ngPackagr,
  ]: AngularDeps) {
    const angularEnv = new AngularEnv(
      jestAspect,
      tsAspect,
      compiler,
      webpack,
      workspace,
      pkg,
      tester,
      eslint,
      ngPackagr
    );
    const angularMain = new AngularMain(angularEnv, envs, application, workspace);
    envs.registerEnv(angularEnv);
    generator.registerComponentTemplate(componentTemplates);
    return angularMain;
  }
}

AngularAspect.addRuntime(AngularMain);
