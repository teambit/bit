import { MainRuntime } from '@teambit/cli';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import * as babel from '@babel/core';
import { BabelCompilerOptions } from './compiler-options';
import { BabelAspect } from './babel.aspect';
import { BabelCompiler } from './babel.compiler';

export class BabelMain {
  constructor(private logger: Logger, private compiler: CompilerMain) {}

  createCompiler(options: BabelCompilerOptions, babelModule = babel): BabelCompiler {
    return new BabelCompiler(BabelAspect.id, this.logger, this.compiler, options, babelModule);
  }

  getPackageJsonProps() {
    return {
      main: 'dist/{main}.js',
    };
  }

  static runtime = MainRuntime;
  static dependencies = [LoggerAspect, CompilerAspect];

  static async provider([loggerExt, compiler]: [LoggerMain, CompilerMain]) {
    const logger = loggerExt.createLogger(BabelAspect.id);
    return new BabelMain(logger, compiler);
  }
}

BabelAspect.addRuntime(BabelMain);
