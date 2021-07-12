import { MainRuntime } from '@teambit/cli';
import { Options as PrettierModuleOptions } from 'prettier';
import { Formatter } from '@teambit/formatter';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { PrettierAspect } from './prettier.aspect';
import { PrettierFormatter } from './prettier.formatter';

export type PrettierOptions = {
  /**
   * formatter config for prettier.
   */
  config: PrettierModuleOptions;
};

export class PrettierMain {
  constructor(private logger: Logger) {}
  /**
   * create a prettier formatter instance.
   * @param options prettier options.
   * @param PrettierModule reference to an `prettier` module.
   */
  createFormatter(options: PrettierOptions, PrettierModule?: any): Formatter {
    return new PrettierFormatter(this.logger, options, PrettierModule);
  }

  static runtime = MainRuntime;

  static dependencies = [LoggerAspect];

  static async provider([loggerExt]: [LoggerMain]): Promise<PrettierMain> {
    const logger = loggerExt.createLogger(PrettierAspect.id);
    return new PrettierMain(logger);
  }
}

PrettierAspect.addRuntime(PrettierMain);
