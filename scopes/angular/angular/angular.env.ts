import { Environment } from '@teambit/envs';
import { ESLintMain } from '@teambit/eslint';
import { Linter } from '@teambit/linter';
import { eslintConfig } from './eslint/eslintrc';

export class AngularEnv implements Environment {
  name = 'Angular';
  icon = 'https://static.bit.dev/extensions-icons/angular.svg';

  constructor(
    //     /**
    //      * jest extension
    //      */
    //     private jestAspect: JestMain,
    //
    //     /**
    //      * typescript extension.
    //      */
    //     private tsAspect: TypescriptMain,
    //
    //     /**
    //      * compiler extension.
    //      */
    //     private compiler: CompilerMain,
    //
    //     /**
    //      * webpack extension.
    //      */
    //     private webpack: WebpackMain,
    //
    //     /**
    //      * workspace extension.
    //      */
    //     private workspace: Workspace,
    //
    //     /**
    //      * pkg extension.
    //      */
    //     private pkg: PkgMain,
    //
    //     /**
    //      * tester extension
    //      */
    //     private tester: TesterMain,
    //
    //     private config: ReactMainConfig,

    private eslint: ESLintMain
  ) {}

  async __getDescriptor() {
    return {
      type: 'angular',
    };
  }

  getDependencies() {
    return {
      dependencies: {
        '@angular/common': '-',
        '@angular/core': '-',
        tslib: '-',
        rxjs: '-',
        'zone.js': '-',
      },
      // TODO: add this only if using ts
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
      // TODO: take version from config
      peerDependencies: {
        '@angular/common': '^11.0.0',
        '@angular/core': '^11.0.0',
        tslib: '^2.0.0',
        rxjs: '^6.0.0',
        'zone.js': '^0.11.0',
        typescript: '~4.2.0',
      },
    };
  }

  /**
   * returns and configures the component linter.
   */
  getLinter(): Linter {
    return this.eslint.createLinter({
      config: eslintConfig,
      // resolve all plugins from the angular environment.
      pluginPath: __dirname,
    });
  }
}
