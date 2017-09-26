// @flow
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import requireFromString from 'require-from-string';
import BitJson from 'bit-scope-client/bit-json';
import componentResolver from 'bit-scope-client/component-resolver';

class CompilerError extends Error {
  compilerId: string;
  constructor(compilerId: string) {
    super();
    this.compilerId = compilerId;
  }
}
class CompilerNotFound extends CompilerError {}
class InvalidCompiler extends CompilerError {}

function requireCompiledSource(componentDir: string, distFile: string): string {
  const bitJson = BitJson.load(componentDir);
  const compilerId = bitJson.compiler;
  const implFile = path.join(componentDir, bitJson.impl);
  let compilerPath: string;
  const implFileContent = fs.readFileSync(implFile);
  try {
    compilerPath = componentResolver(compilerId);
  } catch (err) {
    throw new CompilerNotFound(compilerId);
  }
  const compiler = require(compilerPath); // eslint-disable-line
  if (!compiler.compile) throw new InvalidCompiler(compilerId);
  const src = compiler.compile(implFileContent);
  fs.outputFileSync(distFile, src.code);
  return requireFromString(src.code);
}

export default function registerComponent(componentDir: string, distFile: string): string {
  try {
    return requireCompiledSource(componentDir, distFile);
  } catch (err) {
    if (err instanceof CompilerNotFound) {
      const cmd = chalk.bold(`bit import ${err.compilerId} --compiler --save`);
      console.error(chalk.red(`your compiler ${err.compilerId} was not found. Please install it by running ${cmd}`)); // eslint-disable-line
    } else if (err instanceof InvalidCompiler) {
      console.error(chalk.red(`"${err.compilerId}" does not have a valid compiler interface, it has to return a compile method`)); // eslint-disable-line
    } else {
      console.error(chalk.red(`An error has been found while compiling your inline-component at ${componentDir} \n`), err); // eslint-disable-line
    }
    return null;
  }
}
