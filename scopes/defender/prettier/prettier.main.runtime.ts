import { MainRuntime } from '@teambit/cli';
import { Options as PrettierModuleOptions } from 'prettier';
import FormatterAspect, { Formatter, FormatterMain, FormatterOptions } from '@teambit/formatter';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { PrettierConfigMutator } from '@teambit/defender.prettier.config-mutator';
import WorkspaceConfigFilesAspect, { WorkspaceConfigFilesMain } from '@teambit/workspace-config-files';
import { PrettierAspect } from './prettier.aspect';
import { PrettierFormatter } from './prettier.formatter';
import { PrettierConfigWriter } from './prettier-config-writer';

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

  static dependencies = [LoggerAspect, FormatterAspect, WorkspaceConfigFilesAspect];

  static async provider([loggerExt, formatter, workspaceConfigFiles]: [
    LoggerMain,
    FormatterMain,
    WorkspaceConfigFilesMain
  ]): Promise<PrettierMain> {
    const logger = loggerExt.createLogger(PrettierAspect.id);
    workspaceConfigFiles.registerConfigWriter(new PrettierConfigWriter(formatter));
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
