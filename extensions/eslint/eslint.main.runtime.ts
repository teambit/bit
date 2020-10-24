import { MainRuntime } from '@teambit/cli';
import { ESLintAspect } from './eslint.aspect';
import { ESLintLinter } from './eslint.linter';
import { ESLint, Linter } from 'eslint';

export type ESLintOptions = {
  /**
   * linter config for eslint.
   */
  config: Linter.Config;

  /**
   * specify to path to resolve eslint plugins from.
   */
  pluginPath?: string;

  /**
   * decide the formatter for the CLI output.
   */
  formatter?: string;
};

export type ESLintConfig = {};

export class ESLintMain {
  /**
   * create a eslint linter instance.
   * @param options eslint options.
   * @param ESLintModule reference to an `eslint` module.
   */
  createLinter(options: ESLintOptions, ESLintModule?: any) {
    return new ESLintLinter(options, ESLintModule);
  }

  static runtime = MainRuntime;

  static dependencies = [];

  static async provider() {
    return new ESLintMain();
  }
}

ESLintAspect.addRuntime(ESLintMain);
