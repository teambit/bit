import { BuildTask } from '@teambit/builder';
import { CompilerMain, CompilerOptions } from '@teambit/compiler';
import { BuilderEnv, DependenciesEnv, EnvDescriptor, LinterEnv } from '@teambit/envs';
import { ESLintMain } from '@teambit/eslint';
import { JestMain } from '@teambit/jest';
import { Linter } from '@teambit/linter';
import { NgPackagrMain } from '@teambit/ng-packagr';
import { PkgMain } from '@teambit/pkg';
import { TesterMain } from '@teambit/tester';
import { TsCompilerOptionsWithoutTsConfig, TypescriptMain } from '@teambit/typescript';
import { WebpackMain } from '@teambit/webpack';
import { Workspace } from '@teambit/workspace';
import { Bundler, BundlerContext } from '@teambit/bundler';
import { TsConfigSourceFile } from 'typescript';
import { eslintConfig } from './eslint/eslintrc';

/**
 * a component environment built for [Angular](https://angular.io).
 */
export class AngularEnv implements BuilderEnv, LinterEnv, DependenciesEnv {
  name = 'Angular';
  icon = 'https://static.bit.dev/extensions-icons/angular.svg';

  constructor(
    private jestAspect: JestMain,
    private tsAspect: TypescriptMain,
    private compiler: CompilerMain,
    private webpack: WebpackMain,
    private workspace: Workspace,
    private pkg: PkgMain,
    private tester: TesterMain,
    private eslint: ESLintMain,
    private ngPackagrAspect: NgPackagrMain
  ) {}

  /**
   * Returns the Environment descriptor
   * Required for any task
   */
  async __getDescriptor(): Promise<EnvDescriptor> {
    return {
      type: 'angular',
    };
  }

  private createNgPackgrCompiler(tsconfig?: TsConfigSourceFile, compilerOptions: Partial<CompilerOptions> = {}) {
    return this.ngPackagrAspect.createCompiler(tsconfig, {
      ...compilerOptions,
    });
  }

  getCompiler(tsconfig?: TsConfigSourceFile, compilerOptions: Partial<TsCompilerOptionsWithoutTsConfig> = {}) {
    return this.createNgPackgrCompiler(tsconfig, compilerOptions);
  }

  private getCompilerTask(
    tsconfig?: TsConfigSourceFile,
    compilerOptions: Partial<TsCompilerOptionsWithoutTsConfig> = {}
  ) {
    return this.compiler.createTask('NgPackagrCompiler', this.getCompiler(tsconfig, compilerOptions));
  }

  /**
   * Returns the component build pipeline
   * Required for `bit build`
   */
  getBuildPipe(
    tsconfig?: TsConfigSourceFile,
    compilerOptions: Partial<TsCompilerOptionsWithoutTsConfig> = {}
  ): BuildTask[] {
    return [this.getCompilerTask(tsconfig, compilerOptions)];
  }

  /**
   * Returns a paths to a function which mounts a given component to DOM
   * Required for `bit build`
   */
  getMounter() {
    // return require.resolve('./mount');
    return ''; // TODO(ocombe)
  }

  /**
   * Returns a path to a docs template.
   * Required for `bit build`
   */
  getDocsTemplate() {
    // return require.resolve('./docs');
    return ''; // TODO(ocombe)
  }
  /**
   * Returns a bundler for the preview.
   * Required for `bit build` & `build start`
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getBundler(context: BundlerContext, transformers: any[]): Promise<Bundler> {
    return null as any; // TODO(ocombe)
  }

  /**
   * Returns and configures the component linter.
   * Required for `bit lint`
   */
  getLinter(): Linter {
    return this.eslint.createLinter({
      config: eslintConfig,
      // resolve all plugins from the angular environment.
      pluginPath: __dirname,
    });
  }

  /**
   * Returns the list of dependencies
   * Required for any task
   */
  getDependencies() {
    return {
      dependencies: {
        '@angular/common': '-',
        '@angular/core': '-',
        tslib: '^2.0.0',
        rxjs: '-',
        'zone.js': '-',
      },
      devDependencies: {
        '@angular-devkit/build-angular': '<0.1200.0',
        '@angular/cli': '^11.0.0',
        '@angular/compiler': '^11.0.0',
        '@angular/compiler-cli': '^11.0.0',
        '@types/jasmine': '^3.0.0',
        '@types/node': '^12.0.0',
        'jasmine-core': '^3.0.0',
        'ng-packagr': '^11.0.0',
        'ts-node': '^8.0.0',
        typescript: '-',
      },
      peerDependencies: {
        '@angular/common': '^11.0.0',
        '@angular/core': '^11.0.0',
        rxjs: '^6.0.0',
        'zone.js': '^0.11.0',
        typescript: '~4.1.0',
      },
    };
  }
}
