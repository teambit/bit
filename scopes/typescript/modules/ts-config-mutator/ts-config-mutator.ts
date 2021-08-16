import { clone, merge } from 'lodash';
import { CompilerOptions } from 'typescript';
import { TypeScriptCompilerOptions } from '@teambit/typescript';

export type Target = 'ES3' | 'ES5' | 'ES2015' | 'ES2016' | 'ES2017' | 'ES2018' | 'ES2019' | 'ES2020' | 'ESNext';

export class TypescriptConfigMutator {
  constructor(public raw: TypeScriptCompilerOptions) {}

  clone(): TypescriptConfigMutator {
    return new TypescriptConfigMutator(clone(this.raw));
  }

  // TODO: move to a shared place, as all compilers mutators will need it
  setName(name: string) {
    this.raw.name = name;
    return this;
  }

  /**
   * optional. default to "dist".
   * useful when the build pipeline has multiple compiler tasks of the same compiler.
   * e.g. using the same Babel compiler for two different tasks, one for creating "es5" files, and
   * the second for creating "esm". the artifact names would be "es5" and "esm" accordingly.
   */
  setArtifactName(artifactName: string) {
    this.raw.artifactName = artifactName;
    return this;
  }

  // TODO: move to a shared place, as all compilers mutators will need it
  /**
   * relative path of the dist directory inside the capsule. e.g. "dist".
   */
  setDistDir(distDir: string) {
    this.raw.distDir = distDir;
    return this;
  }

  // TODO: move to a shared place, as all compilers mutators will need it
  /**
   * determines which ones of the generated files will be saved in the bit objects when tagging.
   * e.g. distGlobPatterns = [`${this.distDir}/**`, `!${this.distDir}/tsconfig.tsbuildinfo`];
   * see https://github.com/mrmlnc/fast-glob for the supported glob patters syntax.
   */
  setDistGlobPatterns(distGlobPatterns: string[]) {
    this.raw.distGlobPatterns = distGlobPatterns;
    return this;
  }

  // TODO: move to a shared place, as all compilers mutators will need it
  /**
   * whether or not unsupported files (such as assets) should be copied into the dist directory
   */
  setShouldCopyNonSupportedFiles(shouldCopyNonSupportedFiles: boolean) {
    this.raw.shouldCopyNonSupportedFiles = shouldCopyNonSupportedFiles;
    return this;
  }

  /**
   * optional. default to "dist".
   * useful when the build pipeline has multiple compiler tasks of the same compiler.
   * e.g. using the same Babel compiler for two different tasks, one for creating "es5" files, and
   * the second for creating "esm". the artifact names would be "es5" and "esm" accordingly.
   */
  artifactName?: string;

  addTypes(typesPaths: string[]): TypescriptConfigMutator {
    this.raw.types.push(...typesPaths);
    return this;
  }

  setExperimentalDecorators(value: boolean): TypescriptConfigMutator {
    this.raw.tsconfig.compilerOptions.experimentalDecorators = value;
    return this;
  }

  setTarget(target: Target): TypescriptConfigMutator {
    this.raw.tsconfig.compilerOptions.target = target;
    return this;
  }

  setCompilerOptions(options: CompilerOptions): TypescriptConfigMutator {
    this.raw.tsconfig.compilerOptions = options;
    return this;
  }

  setTsConfig(config: Record<string, any>): TypescriptConfigMutator {
    this.raw.tsconfig = config;
    return this;
  }

  mergeTsConfig(config: Record<string, any>): TypescriptConfigMutator {
    this.raw.tsconfig = merge({}, this.raw.tsconfig, config);
    return this;
  }

  addExclude(exclusions: string[]): TypescriptConfigMutator {
    this.raw.tsconfig.exclude.push(exclusions);
    return this;
  }

  /**
   * Run the compiler for .js files. this will only affect whether to run the compiler on the files
   * or not. It won't change the tsconfig to support or not support js files.
   */
  setCompileJs(compileJs: boolean) {
    this.raw.compileJs = compileJs;
    return this;
  }

  /**
   * Run the compiler for .js files. this will only affect whether to run the compiler on the files
   * or not. It won't change the tsconfig to support or not support jsx files.
   */
  setCompileJsx(compileJsx: boolean) {
    this.raw.compileJsx = compileJsx;
    return this;
  }
}
