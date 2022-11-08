import { MainRuntime } from '@teambit/cli';
import { Options as PrettierModuleOptions } from 'prettier';
import { Formatter, FormatterOptions } from '@teambit/formatter';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { PrettierConfigMutator } from '@teambit/defender.prettier.config-mutator';
import { PrettierAspect } from './prettier.aspect';
import { PrettierFormatter } from './prettier.formatter';

export type PrettierOptions = {
  /**
   * formatter config for prettier.
   */
  config: PrettierModuleOptions;
};

export type PrettierConfigTransformContext = {
  check: boolean;
};

export type PrettierConfigTransformer = (
  config: PrettierConfigMutator,
  context: PrettierConfigTransformContext
) => PrettierConfigMutator;

export class PrettierMain {
  constructor(private logger: Logger) {}
  /**
   * create a prettier formatter instance.
   * @param options prettier options.
   * @param PrettierModule reference to an `prettier` module.
   */
  createFormatter(
    formatterOptions: FormatterOptions = {},
    options: PrettierOptions,
    transformers: PrettierConfigTransformer[] = [],
    PrettierModule?: any
  ): Formatter {
    const configMutator = new PrettierConfigMutator(options.config);
    const transformerContext: PrettierConfigTransformContext = { check: !!formatterOptions.check };
    const afterMutation = runTransformersWithContext(configMutator.clone(), transformers, transformerContext);
    return new PrettierFormatter(this.logger, afterMutation.raw, PrettierModule);
  }

  static runtime = MainRuntime;

  static dependencies = [LoggerAspect];

  static async provider([loggerExt]: [LoggerMain]): Promise<PrettierMain> {
    const logger = loggerExt.createLogger(PrettierAspect.id);
    return new PrettierMain(logger);
  }
}

PrettierAspect.addRuntime(PrettierMain);

export function runTransformersWithContext(
  config: PrettierConfigMutator,
  transformers: PrettierConfigTransformer[] = [],
  context: PrettierConfigTransformContext
): PrettierConfigMutator {
  if (!Array.isArray(transformers)) return config;
  const newConfig = transformers.reduce((acc, transformer) => {
    return transformer(acc, context);
  }, config);
  return newConfig;
}
