import { TaskHandler } from '@teambit/builder';
import { CompilerTask, CompilerTaskOptions } from '@teambit/compilation.compiler-task';
import { TypescriptCompiler } from './typescript-compiler';
import { TypeScriptCompilerOptions } from './typescript-compiler-options';

export type TypeScriptTaskOptions = TypeScriptCompilerOptions & Pick<CompilerTaskOptions, 'description'>;

export const TypescriptTask = {
  from: (options: TypeScriptTaskOptions): TaskHandler => {
    const name = options.name || 'TypescriptCompile';
    const description = options.description || 'compiling components using Typescript';

    return CompilerTask.from({
      name,
      description,
      compiler: TypescriptCompiler.from(options),
    });
  },
};
