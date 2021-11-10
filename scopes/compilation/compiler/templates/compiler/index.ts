import { ComponentContext, ComponentTemplate } from '@teambit/generator';
import { indexFile } from './files/index-file';
import { aspectFile } from './files/aspect-file';
import { mainRuntimeFile } from './files/main-runtime-file';
import { compilerFile } from './files/compiler-file';

export const compilerTemplate: ComponentTemplate = {
  name: 'compiler',
  description: 'A compiler implementation',
  hidden: true,
  generateFiles: (context: ComponentContext) => {
    return [
      {
        relativePath: 'index.ts',
        content: indexFile(context),
        isMain: true,
      },
      {
        relativePath: `${context.name}.aspect.ts`,
        content: aspectFile(context),
      },
      {
        relativePath: `${context.name}.compiler.ts`,
        content: compilerFile(context),
      },
      {
        relativePath: `${context.name}.main.runtime.ts`,
        content: mainRuntimeFile(context),
      },
    ];
  },
};
