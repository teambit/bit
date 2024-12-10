import { MainRuntime } from '@teambit/cli';
// import { Linter as ESLinter, ESLint as ESLintLib } from 'eslint';
import { ESLint as ESLintLib } from 'eslint';
import { Linter, LinterContext, LinterMain } from '@teambit/linter';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import {
  EslintConfigMutator,
  EslintConfigTransformContext,
  EslintConfigTransformer,
} from '@teambit/defender.eslint.config-mutator';
import { getCloudDomain } from '@teambit/legacy.constants';
import { WorkspaceConfigFilesMain } from '@teambit/workspace-config-files';
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

  // TODO: improve type
  /**
   * typescript config for eslint.
   * If you pass this, bit will auto generate a temp config file in `node_modules/.cache` and pass it to eslint.
   * In case you have include/exclude props in the tsconfig, they will be changed to handle the fact that they are inside the node_modules/.cache folder.
   * a `../../` will be added to the beginning of the path.
   */
  tsConfig?: Record<string, any>;
};

export class ESLintMain {
  constructor(private logger: Logger) {}

  /**
   * @deprecated use eslint linter from https://bit.cloud/teambit/defender/eslint-linter
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
    this.logger.consoleWarning(
      `The 'Eslint' aspect is deprecated. Please use the 'Eslint linter' component instead. For more details, visit: https://${getCloudDomain()}/teambit/defender/eslint-linter`
    );
    const mergedOptions = getOptions(options, context);
    const configMutator = new EslintConfigMutator(mergedOptions);
    const transformerContext: EslintConfigTransformContext = { fix: !!context.fix };
    const afterMutation = runTransformersWithContext(configMutator.clone(), transformers, transformerContext);

    // @ts-ignore
    return new ESLintLinter(this.logger, afterMutation.raw, ESLintModule);
  }

  static runtime = MainRuntime;

  static dependencies = [LoggerAspect];

  static async provider([loggerExt]: [LoggerMain, WorkspaceConfigFilesMain, LinterMain]): Promise<ESLintMain> {
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
    // TODO: this should be probably be replaced with resolve-plugins-relative-to
    // https://eslint.org/docs/latest/use/command-line-interface#--resolve-plugins-relative-to
    cwd: options.pluginPath,
    fix: !!context.fix,
    fixTypes: context.fixTypes as ESLintLib.Options['fixTypes'],
  };
  return Object.assign({}, options, { config: mergedConfig, extensions: context.extensionFormats });
}

export function runTransformersWithContext(
  config: EslintConfigMutator,
  transformers: EslintConfigTransformer[] = [],
  context: EslintConfigTransformContext
): EslintConfigMutator {
  if (!Array.isArray(transformers)) return config;
  const newConfig = transformers.reduce((acc, transformer) => {
    return transformer(acc, context);
  }, config);
  return newConfig;
}
