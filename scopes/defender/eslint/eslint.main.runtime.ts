import { MainRuntime } from '@teambit/cli';
import { Linter } from 'eslint';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { ESLintAspect } from './eslint.aspect';
import { ESLintLinter } from './eslint.linter';

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

export class ESLintMain {
  constructor(private logger: Logger) {}
  /**
   * create a eslint linter instance.
   * @param options eslint options.
   * @param ESLintModule reference to an `eslint` module.
   */
  createLinter(options: ESLintOptions, ESLintModule?: any): ESLintLinter {
    return new ESLintLinter(this.logger, options, ESLintModule);
  }

  static runtime = MainRuntime;

  static dependencies = [LoggerAspect];

  static async provider([loggerExt]: [LoggerMain]): Promise<ESLintMain> {
    const logger = loggerExt.createLogger(ESLintAspect.id);
    return new ESLintMain(logger);
  }
}

ESLintAspect.addRuntime(ESLintMain);
