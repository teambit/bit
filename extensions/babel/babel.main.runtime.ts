import { MainRuntime } from '@teambit/cli';
import { Compiler } from '@teambit/compiler';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import type { SchemaMain } from '@teambit/schema';
import { SchemaAspect } from '@teambit/schema';

import { BabelCompilerOptions } from './compiler-options';
import { BabelAspect } from './babel.aspect';
import { BabelCompiler } from './babel.compiler';
import { BabelParser } from './babel.parser';

export class BabelMain {
  constructor(private logger: Logger) {}

  createCompiler(options: BabelCompilerOptions): Compiler {
    return new BabelCompiler(BabelAspect.id, this.logger, options);
  }

  getPackageJsonProps() {
    return {
      main: 'dist/{main}.js',
    };
  }

  static runtime = MainRuntime;
  static dependencies = [SchemaAspect, LoggerAspect];

  static async provider([schema, loggerExt]: [SchemaMain, LoggerMain]) {
    schema.registerParser(new BabelParser());
    const logger = loggerExt.createLogger(BabelAspect.id);
    return new BabelMain(logger);
  }
}

BabelAspect.addRuntime(BabelMain);
