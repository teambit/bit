import { MainRuntime } from '@teambit/cli';
import { Compiler, CompilerAspect, CompilerMain } from '@teambit/compiler';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import type { SchemaMain } from '@teambit/schema';
import { SchemaAspect } from '@teambit/schema';
import * as babel from '@babel/core';
import { BabelCompilerOptions } from './compiler-options';
import { BabelAspect } from './babel.aspect';
import { BabelCompiler } from './babel.compiler';
import { BabelParser } from './babel.parser';

export class BabelMain {
  constructor(private logger: Logger, private compiler: CompilerMain) {}

  createCompiler(options: BabelCompilerOptions, babelModule = babel): Compiler {
    return new BabelCompiler(BabelAspect.id, this.logger, this.compiler, options, babelModule);
  }

  getPackageJsonProps() {
    return {
      main: 'dist/{main}.js',
    };
  }

  static runtime = MainRuntime;
  static dependencies = [SchemaAspect, LoggerAspect, CompilerAspect];

  static async provider([schema, loggerExt, compiler]: [SchemaMain, LoggerMain, CompilerMain]) {
    schema.registerParser(new BabelParser());
    const logger = loggerExt.createLogger(BabelAspect.id);
    return new BabelMain(logger, compiler);
  }
}

BabelAspect.addRuntime(BabelMain);
