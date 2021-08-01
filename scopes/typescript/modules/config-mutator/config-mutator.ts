import { clone } from 'lodash';
import { CompilerOptions } from 'typescript';
import { TypeScriptCompilerOptions } from '@teambit/typescript';

export type Target = "ES3" | "ES5" | "ES2015" | "ES2016" | "ES2017" | "ES2018" | "ES2019" | "ES2020" | "ESNext";

export class TypescriptConfigMutator {
  constructor(public raw: TypeScriptCompilerOptions) {}

  clone(): TypescriptConfigMutator {
    return new TypescriptConfigMutator(clone(this.raw));
  }

  addTypes(typesPaths: string[]): TypescriptConfigMutator {
      this.raw.types.concat(typesPaths);
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

  addExclude(exclusions: string[]): TypescriptConfigMutator {
    this.raw.tsconfig.exclude.push(exclusions);
    return this;
  }
  
}
