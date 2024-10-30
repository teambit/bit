import { MainRuntime } from '@teambit/cli';
import { Options as PrettierModuleOptions } from 'prettier';
import { Formatter, FormatterMain, FormatterOptions } from '@teambit/formatter';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import {
  PrettierConfigMutator,
  PrettierConfigTransformContext,
  PrettierConfigTransformer,
} from '@teambit/defender.prettier.config-mutator';
import { getCloudDomain } from '@teambit/legacy/dist/constants';
import { WorkspaceConfigFilesMain } from '@teambit/workspace-config-files';
import { PrettierAspect } from './prettier.aspect';
import { PrettierFormatter } from './prettier.formatter';

export type PrettierOptions = {
  /**
   * formatter config for prettier.
   */
  config: PrettierModuleOptions;
};

// TODO: this aspect is not used anymore, it is still here for now for backward compatibility.
// it will be removed as part of next major bit version
export class PrettierMain {
  constructor(private logger: Logger) {}
  /**
   * @deprecated use prettier formatter from https://bit.cloud/teambit/defender/prettier-formatter
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
    this.logger.consoleWarning(
      `The 'Prettier' aspect is deprecated. Please use the 'prettier formatter' component instead. For more details, visit: https://${getCloudDomain()}/teambit/defender/prettier-formatter`
    );
    const configMutator = new PrettierConfigMutator(options.config);
    const transformerContext: PrettierConfigTransformContext = { check: !!formatterOptions.check };
    const afterMutation = runTransformersWithContext(configMutator.clone(), transformers, transformerContext);
    return new PrettierFormatter(this.logger, afterMutation.raw, PrettierModule);
  }

  static runtime = MainRuntime;

  static dependencies = [LoggerAspect];

  static async provider([loggerExt]: [LoggerMain, FormatterMain, WorkspaceConfigFilesMain]): Promise<PrettierMain> {
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
