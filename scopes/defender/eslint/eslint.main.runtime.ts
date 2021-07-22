import { MainRuntime } from '@teambit/cli';
// import { Linter as ESLinter, ESLint as ESLintLib } from 'eslint';
import { ESLint as ESLintLib } from 'eslint';
import { Linter, LinterContext } from '@teambit/linter';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { EslintConfigMutator } from '@teambit/defender.eslint.config-mutator';
import { ESLintAspect } from './eslint.aspect';
import { ESLintLinter } from './eslint.linter';

export type ESLintOptions = {
  /**
   * linter config for eslint.
   */
  // config: ESLinter.Config;
  config: ESLintLib.Options;

  /**
   * specify to path to resolve eslint plugins from.
   */
  pluginPath?: string;

  /**
   * decide the formatter for the CLI output.
   */
  formatter?: string;

  /**
   * file types to lint.
   */
  extensions?: string[];
};

export type EslintConfigTransformContext = {
  fix: boolean;
};

export type EslintConfigTransformer = (
  config: EslintConfigMutator,
  context: EslintConfigTransformContext
) => EslintConfigMutator;

export class ESLintMain {
  constructor(private logger: Logger) {}
  /**
   * create a eslint linter instance.
   * @param options eslint options.
   * @param ESLintModule reference to an `eslint` module.
   */
  createLinter(
    context: LinterContext,
    options: ESLintOptions,
    transformers: EslintConfigTransformer[] = [],
    ESLintModule?: any
  ): Linter {
    const mergedOptions = getOptions(options, context);
    const configMutator = new EslintConfigMutator(mergedOptions);
    const transformerContext: EslintConfigTransformContext = { fix: !!context.fix };
    const afterMutation = runTransformersWithContext(configMutator.clone(), transformers, transformerContext);

    return new ESLintLinter(this.logger, afterMutation.raw, ESLintModule);
  }

  static runtime = MainRuntime;

  static dependencies = [LoggerAspect];

  static async provider([loggerExt]: [LoggerMain]): Promise<ESLintMain> {
    const logger = loggerExt.createLogger(ESLintAspect.id);
    return new ESLintMain(logger);
  }
}

ESLintAspect.addRuntime(ESLintMain);

/**
 * get options for eslint.
 */
function getOptions(options: ESLintOptions, context: LinterContext): ESLintOptions {
  const mergedConfig: ESLintLib.Options = {
    // @ts-ignore - this is a bug in the @types/eslint types
    overrideConfig: options.config,
    extensions: context.extensionFormats,
    useEslintrc: false,
    cwd: options.pluginPath,
    fix: !!context.fix,
    fixTypes: context.fixTypes,
  };
  return Object.assign({}, options, { config: mergedConfig, extensions: context.extensionFormats });
}

export function runTransformersWithContext(
  config: EslintConfigMutator,
  transformers: EslintConfigTransformer[] = [],
  context: EslintConfigTransformContext
): EslintConfigMutator {
  const newConfig = transformers.reduce((acc, transformer) => {
    return transformer(acc, context);
  }, config);
  return newConfig;
}
